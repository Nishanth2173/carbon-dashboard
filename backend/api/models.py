from django.db import models
from django.contrib.auth.models import User
import uuid


class Organization(models.Model):
    """Multi-tenancy root. Every record belongs to one org."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class OrganizationMembership(models.Model):
    ROLE_CHOICES = [('admin', 'Admin'), ('analyst', 'Analyst'), ('viewer', 'Viewer')]
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='memberships')
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='members')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='analyst')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'organization')


class IngestionJob(models.Model):
    """Tracks every file upload / API pull attempt."""
    SOURCE_TYPE_CHOICES = [
        ('sap', 'SAP Fuel & Procurement'),
        ('utility', 'Utility Electricity'),
        ('travel', 'Corporate Travel'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='ingestion_jobs')
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPE_CHOICES)
    original_filename = models.CharField(max_length=500)
    file = models.FileField(upload_to='uploads/%Y/%m/', null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    total_rows = models.IntegerField(default=0)
    successful_rows = models.IntegerField(default=0)
    failed_rows = models.IntegerField(default=0)
    flagged_rows = models.IntegerField(default=0)
    error_message = models.TextField(blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"{self.source_type} | {self.original_filename} | {self.status}"


class PlantCodeLookup(models.Model):
    """SAP plant codes -> human-readable names and metadata."""
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    country = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return f"{self.code} - {self.name}"


class EmissionRecord(models.Model):
    """
    Normalized emission record. Source-of-truth row after ingestion.
    Every raw row from SAP / Utility / Travel maps to one of these.

    Scope definitions:
      Scope 1 - Direct combustion (SAP fuel)
      Scope 2 - Purchased electricity (Utility)
      Scope 3 - Business travel (flights, hotels, ground)
    """
    SCOPE_CHOICES = [
        ('scope1', 'Scope 1 - Direct'),
        ('scope2', 'Scope 2 - Electricity'),
        ('scope3', 'Scope 3 - Travel'),
    ]
    CATEGORY_CHOICES = [
        # Scope 1
        ('diesel', 'Diesel'),
        ('petrol', 'Petrol'),
        ('natural_gas', 'Natural Gas'),
        ('lpg', 'LPG'),
        # Scope 2
        ('electricity', 'Grid Electricity'),
        # Scope 3
        ('flight_domestic', 'Flight - Domestic'),
        ('flight_shorthaul', 'Flight - Short Haul'),
        ('flight_longhaul', 'Flight - Long Haul'),
        ('hotel', 'Hotel Stay'),
        ('ground_taxi', 'Ground - Taxi/Rideshare'),
        ('ground_rail', 'Ground - Rail'),
        ('ground_rental', 'Ground - Car Rental'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('flagged', 'Flagged / Suspicious'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='emission_records')
    ingestion_job = models.ForeignKey(IngestionJob, on_delete=models.CASCADE, related_name='records')

    # Scope & Category
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES)

    # Activity data (normalized)
    activity_value = models.FloatField(help_text="Quantity in normalized unit")
    activity_unit = models.CharField(max_length=20, help_text="e.g. kWh, liters, km, nights")
    activity_date = models.DateField()
    billing_period_start = models.DateField(null=True, blank=True)
    billing_period_end = models.DateField(null=True, blank=True)

    # Emission calculation
    emission_factor = models.FloatField(help_text="kgCO2e per activity unit")
    emission_factor_source = models.CharField(max_length=200, blank=True, help_text="e.g. DEFRA 2024, IPCC AR6")
    co2e_kg = models.FloatField(help_text="Calculated: activity_value * emission_factor")

    # Location / entity context
    site_or_cost_center = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=100, blank=True)
    currency = models.CharField(max_length=10, blank=True)
    spend_amount = models.FloatField(null=True, blank=True)

    # Source tracking (provenance)
    source_row_index = models.IntegerField(help_text="Row number in original file")
    raw_data = models.JSONField(help_text="Original unparsed row stored verbatim")
    source_hash = models.CharField(max_length=64, help_text="SHA256 of raw row to detect duplicates")

    # Review workflow
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_records')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True)

    # Flags
    is_duplicate = models.BooleanField(default=False)
    is_outlier = models.BooleanField(default=False)
    flag_reason = models.TextField(blank=True)

    # Immutability: once approved + locked, edits are forbidden
    is_locked = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-activity_date']
        indexes = [
            models.Index(fields=['organization', 'scope']),
            models.Index(fields=['organization', 'status']),
            models.Index(fields=['source_hash']),
            models.Index(fields=['activity_date']),
        ]

    def __str__(self):
        return f"{self.scope} | {self.category} | {self.co2e_kg:.2f} kgCO2e | {self.activity_date}"

    def save(self, *args, **kwargs):
        if self.is_locked:
            raise ValueError("Cannot modify a locked record. Create an audit trail entry instead.")
        self.co2e_kg = self.activity_value * self.emission_factor
        super().save(*args, **kwargs)


class IngestionFailure(models.Model):
    """Rows that failed parsing or validation during ingestion."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ingestion_job = models.ForeignKey(IngestionJob, on_delete=models.CASCADE, related_name='failures')
    row_index = models.IntegerField()
    raw_row = models.JSONField()
    failure_reason = models.TextField()
    failure_type = models.CharField(max_length=50, choices=[
        ('parse_error', 'Parse Error'),
        ('missing_field', 'Missing Required Field'),
        ('invalid_unit', 'Invalid Unit'),
        ('invalid_date', 'Invalid Date'),
        ('unknown_code', 'Unknown Code / Lookup Failed'),
        ('validation', 'Validation Error'),
    ])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['row_index']


class AuditTrail(models.Model):
    """Immutable log of every change to an EmissionRecord."""
    ACTION_CHOICES = [
        ('created', 'Created'),
        ('edited', 'Edited'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('locked', 'Locked for Audit'),
        ('flagged', 'Flagged'),
        ('unflagged', 'Unflagged'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    record = models.ForeignKey(EmissionRecord, on_delete=models.CASCADE, related_name='audit_trail')
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    before_state = models.JSONField(null=True, blank=True)
    after_state = models.JSONField(null=True, blank=True)
    note = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
