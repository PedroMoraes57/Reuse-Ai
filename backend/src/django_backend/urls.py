from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from .views import AnalyzeView, HealthView, NearbyDisposalPointsView


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('accounts.urls')),
    path('api/health/', HealthView.as_view()),
    path('api/health', HealthView.as_view()),
    path('api/analyze/', AnalyzeView.as_view()),
    path('api/analyze', AnalyzeView.as_view()),
    path('api/disposal-points/nearby/', NearbyDisposalPointsView.as_view()),
    path('api/disposal-points/nearby', NearbyDisposalPointsView.as_view()),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
