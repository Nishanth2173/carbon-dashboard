from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.RegisterView.as_view()),
    path('me/', views.MeView.as_view()),
    path('dashboard/', views.DashboardView.as_view()),
    path('jobs/', views.IngestionJobListView.as_view()),
    path('upload/', views.UploadFileView.as_view()),
    path('records/', views.EmissionRecordListView.as_view()),
    path('records/<uuid:pk>/', views.EmissionRecordDetailView.as_view()),
    path('records/bulk-review/', views.BulkReviewView.as_view()),
    path('records/lock/', views.LockRecordsView.as_view()),
    path('jobs/<uuid:job_id>/failures/', views.FailuresListView.as_view()),
    path('records/<uuid:record_id>/audit/', views.AuditTrailView.as_view()),
]
