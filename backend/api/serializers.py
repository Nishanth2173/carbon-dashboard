from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    Organization, OrganizationMembership, IngestionJob,
    EmissionRecord, IngestionFailure, AuditTrail
)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name', 'slug', 'created_at']


class IngestionJobSerializer(serializers.ModelSerializer):
    uploaded_by = UserSerializer(read_only=True)
    source_type_display = serializers.CharField(source='get_source_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    duration_seconds = serializers.SerializerMethodField()

    class Meta:
        model = IngestionJob
        fields = [
            'id', 'source_type', 'source_type_display', 'original_filename',
            'status', 'status_display', 'total_rows', 'successful_rows',
            'failed_rows', 'flagged_rows', 'error_message',
            'started_at', 'completed_at', 'duration_seconds', 'uploaded_by'
        ]

    def get_duration_seconds(self, obj):
        if obj.completed_at and obj.started_at:
            return (obj.completed_at - obj.started_at).total_seconds()
        return None


class EmissionRecordSerializer(serializers.ModelSerializer):
    scope_display = serializers.CharField(source='get_scope_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    reviewed_by = UserSerializer(read_only=True)
    source_filename = serializers.CharField(source='ingestion_job.original_filename', read_only=True)

    class Meta:
        model = EmissionRecord
        fields = [
            'id', 'scope', 'scope_display', 'category', 'category_display',
            'activity_value', 'activity_unit', 'activity_date',
            'billing_period_start', 'billing_period_end',
            'emission_factor', 'emission_factor_source', 'co2e_kg',
            'site_or_cost_center', 'country', 'currency', 'spend_amount',
            'source_row_index', 'raw_data',
            'status', 'status_display', 'reviewed_by', 'reviewed_at', 'review_note',
            'is_duplicate', 'is_outlier', 'flag_reason', 'is_locked',
            'created_at', 'updated_at', 'source_filename'
        ]
        read_only_fields = ['id', 'co2e_kg', 'created_at', 'updated_at', 'source_hash']


class EmissionRecordUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmissionRecord
        fields = ['status', 'review_note']

    def validate(self, data):
        if self.instance and self.instance.is_locked:
            raise serializers.ValidationError("This record is locked and cannot be modified.")
        return data


class IngestionFailureSerializer(serializers.ModelSerializer):
    class Meta:
        model = IngestionFailure
        fields = ['id', 'row_index', 'raw_row', 'failure_reason', 'failure_type', 'created_at']


class AuditTrailSerializer(serializers.ModelSerializer):
    performed_by = UserSerializer(read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model = AuditTrail
        fields = ['id', 'action', 'action_display', 'before_state', 'after_state',
                  'note', 'timestamp', 'performed_by']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    org_name = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name', 'org_name']

    def create(self, validated_data):
        org_name = validated_data.pop('org_name')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        slug = org_name.lower().replace(' ', '-')[:50]
        org = Organization.objects.create(name=org_name, slug=slug)
        OrganizationMembership.objects.create(user=user, organization=org, role='admin')
        return user


class DashboardStatsSerializer(serializers.Serializer):
    total_co2e_kg = serializers.FloatField()
    scope1_co2e_kg = serializers.FloatField()
    scope2_co2e_kg = serializers.FloatField()
    scope3_co2e_kg = serializers.FloatField()
    pending_review = serializers.IntegerField()
    approved = serializers.IntegerField()
    flagged = serializers.IntegerField()
    total_records = serializers.IntegerField()
    recent_jobs = IngestionJobSerializer(many=True)
