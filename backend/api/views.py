from django.db.models import Sum, Count, Q
from django.utils import timezone
from rest_framework import generics, status, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.contrib.auth.models import User

from .models import (
    Organization, OrganizationMembership, IngestionJob,
    EmissionRecord, IngestionFailure, AuditTrail
)
from .serializers import (
    UserSerializer, OrganizationSerializer, IngestionJobSerializer,
    EmissionRecordSerializer, EmissionRecordUpdateSerializer,
    IngestionFailureSerializer, AuditTrailSerializer, RegisterSerializer
)
from .parsers import parse_sap_file, parse_utility_file, parse_travel_file


def get_user_org(request):
    membership = OrganizationMembership.objects.filter(user=request.user).first()
    return membership.organization if membership else None


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response({'message': 'Account created', 'username': user.username}, status=201)
        return Response(serializer.errors, status=400)


class MeView(APIView):
    def get(self, request):
        membership = OrganizationMembership.objects.filter(user=request.user).first()
        return Response({
            'user': UserSerializer(request.user).data,
            'organization': OrganizationSerializer(membership.organization).data if membership else None,
            'role': membership.role if membership else None,
        })


class DashboardView(APIView):
    def get(self, request):
        org = get_user_org(request)
        if not org:
            return Response({'error': 'No organization found'}, status=400)

        qs = EmissionRecord.objects.filter(organization=org)

        totals = qs.aggregate(
            total=Sum('co2e_kg'),
            s1=Sum('co2e_kg', filter=Q(scope='scope1')),
            s2=Sum('co2e_kg', filter=Q(scope='scope2')),
            s3=Sum('co2e_kg', filter=Q(scope='scope3')),
        )

        counts = qs.aggregate(
            pending=Count('id', filter=Q(status='pending')),
            approved=Count('id', filter=Q(status='approved')),
            flagged=Count('id', filter=Q(status='flagged')),
            total=Count('id'),
        )

        recent_jobs = IngestionJob.objects.filter(organization=org)[:5]

        # Monthly trend (last 6 months)
        from django.db.models.functions import TruncMonth
        monthly = (
            qs.annotate(month=TruncMonth('activity_date'))
            .values('month', 'scope')
            .annotate(total=Sum('co2e_kg'))
            .order_by('month')
        )

        return Response({
            'total_co2e_kg': totals['total'] or 0,
            'scope1_co2e_kg': totals['s1'] or 0,
            'scope2_co2e_kg': totals['s2'] or 0,
            'scope3_co2e_kg': totals['s3'] or 0,
            'pending_review': counts['pending'],
            'approved': counts['approved'],
            'flagged': counts['flagged'],
            'total_records': counts['total'],
            'recent_jobs': IngestionJobSerializer(recent_jobs, many=True).data,
            'monthly_trend': list(monthly),
        })


class IngestionJobListView(generics.ListAPIView):
    serializer_class = IngestionJobSerializer

    def get_queryset(self):
        org = get_user_org(self.request)
        return IngestionJob.objects.filter(organization=org)


class UploadFileView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        org = get_user_org(request)
        if not org:
            return Response({'error': 'No organization'}, status=400)

        source_type = request.data.get('source_type')
        file = request.FILES.get('file')

        if not source_type or source_type not in ['sap', 'utility', 'travel']:
            return Response({'error': 'Invalid source_type'}, status=400)
        if not file:
            return Response({'error': 'No file provided'}, status=400)

        job = IngestionJob.objects.create(
            organization=org,
            uploaded_by=request.user,
            source_type=source_type,
            original_filename=file.name,
            file=file,
            status='processing',
        )
        file.seek(0)

        try:
            if source_type == 'sap':
                records_data, failures_data = parse_sap_file(file, job, org)
            elif source_type == 'utility':
                records_data, failures_data = parse_utility_file(file, job, org)
            else:
                records_data, failures_data = parse_travel_file(file, job, org)

            # Detect duplicates
            existing_hashes = set(
                EmissionRecord.objects.filter(organization=org)
                .values_list('source_hash', flat=True)
            )

            flagged_count = 0
            created_records = []
            for rd in records_data:
                is_dup = rd['source_hash'] in existing_hashes
                rd['is_duplicate'] = is_dup
                if is_dup:
                    rd['status'] = 'flagged'
                    rd['flag_reason'] = 'Duplicate: same date, quantity, and source already ingested'
                    rd['is_outlier'] = False
                    flagged_count += 1
                else:
                    existing_hashes.add(rd['source_hash'])
                created_records.append(EmissionRecord(**rd))

            # Bulk create records
            EmissionRecord.objects.bulk_create(created_records, ignore_conflicts=True)

            # Detect outliers (simple IQR-based per scope)
            detect_outliers(org)

            # Create failure objects
            for f in failures_data:
                    IngestionFailure.objects.create(
                        ingestion_job=job,
                        row_index=f.get('row_index', 0),
                        raw_row=f.get('raw_row', {}),
                        failure_reason=f.get('failure_reason', 'Unknown error'),
                        failure_type=f.get('failure_type', 'parse_error'),
                    )

            job.status = 'completed'
            job.total_rows = len(records_data) + len(failures_data)
            job.successful_rows = len(records_data)
            job.failed_rows = len(failures_data)
            job.flagged_rows = flagged_count
            job.completed_at = timezone.now()
            job.save()

        except Exception as e:
            job.status = 'failed'
            job.error_message = str(e)
            job.completed_at = timezone.now()
            job.save()
            return Response({'error': str(e), 'job_id': str(job.id)}, status=500)

        return Response(IngestionJobSerializer(job).data, status=201)


def detect_outliers(org):
    """Simple outlier detection: flag records where co2e_kg > 3 std deviations from mean per scope."""
    import statistics
    for scope in ['scope1', 'scope2', 'scope3']:
        records = list(EmissionRecord.objects.filter(organization=org, scope=scope, is_locked=False))
        if len(records) < 10:
            continue
        values = [r.co2e_kg for r in records]
        mean = statistics.mean(values)
        stdev = statistics.stdev(values)
        threshold = mean + 3 * stdev
        for r in records:
            if r.co2e_kg > threshold and not r.is_outlier:
                r.is_outlier = True
                r.flag_reason = f'Outlier: {r.co2e_kg:.2f} kgCO2e > threshold {threshold:.2f}'
                if r.status == 'pending':
                    r.status = 'flagged'
                EmissionRecord.objects.filter(pk=r.pk).update(
                    is_outlier=True, flag_reason=r.flag_reason, status=r.status
                )


class EmissionRecordListView(generics.ListAPIView):
    serializer_class = EmissionRecordSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['activity_date', 'co2e_kg', 'created_at']
    ordering = ['-activity_date']

    def get_queryset(self):
        org = get_user_org(self.request)
        qs = EmissionRecord.objects.filter(organization=org)
        scope = self.request.query_params.get('scope')
        status_filter = self.request.query_params.get('status')
        source_type = self.request.query_params.get('source_type')
        if scope:
            qs = qs.filter(scope=scope)
        if status_filter:
            qs = qs.filter(status=status_filter)
        if source_type:
            qs = qs.filter(ingestion_job__source_type=source_type)
        return qs


class EmissionRecordDetailView(generics.RetrieveUpdateAPIView):
    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return EmissionRecordUpdateSerializer
        return EmissionRecordSerializer

    def get_queryset(self):
        org = get_user_org(self.request)
        return EmissionRecord.objects.filter(organization=org)

    def perform_update(self, serializer):
        record = self.get_object()
        before = {'status': record.status, 'review_note': record.review_note}
        instance = serializer.save(reviewed_by=self.request.user, reviewed_at=timezone.now())
        after = {'status': instance.status, 'review_note': instance.review_note}
        AuditTrail.objects.create(
            record=instance,
            performed_by=self.request.user,
            action=instance.status if instance.status in ('approved', 'rejected', 'flagged') else 'edited',
            before_state=before,
            after_state=after,
        )


class BulkReviewView(APIView):
    def post(self, request):
        org = get_user_org(request)
        record_ids = request.data.get('record_ids', [])
        action = request.data.get('action')  # 'approve' or 'reject'
        note = request.data.get('note', '')

        if action not in ('approve', 'reject'):
            return Response({'error': 'action must be approve or reject'}, status=400)

        status_val = 'approved' if action == 'approve' else 'rejected'
        records = EmissionRecord.objects.filter(organization=org, id__in=record_ids, is_locked=False)
        updated = records.update(
            status=status_val,
            reviewed_by=request.user,
            reviewed_at=timezone.now(),
            review_note=note,
        )
        return Response({'updated': updated})


class LockRecordsView(APIView):
    def post(self, request):
        org = get_user_org(request)
        record_ids = request.data.get('record_ids', [])
        records = EmissionRecord.objects.filter(
            organization=org, id__in=record_ids, status='approved', is_locked=False
        )
        for record in records:
            before = {'is_locked': False}
            EmissionRecord.objects.filter(pk=record.pk).update(is_locked=True)
            record.refresh_from_db()
            AuditTrail.objects.create(
                record=record,
                performed_by=request.user,
                action='locked',
                before_state=before,
                after_state={'is_locked': True},
            )
        return Response({'locked': records.count()})


class FailuresListView(generics.ListAPIView):
    serializer_class = IngestionFailureSerializer

    def get_queryset(self):
        org = get_user_org(self.request)
        job_id = self.kwargs.get('job_id')
        return IngestionFailure.objects.filter(ingestion_job__organization=org, ingestion_job_id=job_id)


class AuditTrailView(generics.ListAPIView):
    serializer_class = AuditTrailSerializer

    def get_queryset(self):
        org = get_user_org(self.request)
        record_id = self.kwargs.get('record_id')
        return AuditTrail.objects.filter(record__organization=org, record_id=record_id)
