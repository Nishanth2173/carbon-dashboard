from django.contrib import admin
from .models import (
    Organization, OrganizationMembership, IngestionJob,
    EmissionRecord, IngestionFailure, AuditTrail, PlantCodeLookup
)

@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'created_at']

@admin.register(OrganizationMembership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ['user', 'organization', 'role', 'joined_at']

@admin.register(IngestionJob)
class IngestionJobAdmin(admin.ModelAdmin):
    list_display = ['original_filename', 'source_type', 'status', 'total_rows', 'started_at']
    list_filter = ['source_type', 'status']

@admin.register(EmissionRecord)
class EmissionRecordAdmin(admin.ModelAdmin):
    list_display = ['scope', 'category', 'co2e_kg', 'activity_date', 'status', 'is_locked']
    list_filter = ['scope', 'status', 'is_locked', 'is_duplicate', 'is_outlier']
    search_fields = ['site_or_cost_center', 'country']

@admin.register(IngestionFailure)
class FailureAdmin(admin.ModelAdmin):
    list_display = ['ingestion_job', 'row_index', 'failure_type', 'created_at']

@admin.register(AuditTrail)
class AuditTrailAdmin(admin.ModelAdmin):
    list_display = ['record', 'action', 'performed_by', 'timestamp']
    list_filter = ['action']

@admin.register(PlantCodeLookup)
class PlantCodeAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'country']
