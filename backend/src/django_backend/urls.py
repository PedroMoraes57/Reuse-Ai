from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse, HttpResponseNotAllowed
from django.views.decorators.csrf import csrf_exempt
from io import BytesIO
from PIL import Image
from rest_framework.authtoken.models import Token

from reuse_ai.predictor import ReusePredictor

_predictor = None

def get_predictor():
    global _predictor
    if _predictor is None:
        _predictor = ReusePredictor()
    return _predictor


@csrf_exempt
def analyze_view(request):
    if request.method != 'POST':
        return HttpResponseNotAllowed(['POST'])

    # Require Token authentication: header `Authorization: Token <key>`
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Token '):
        return JsonResponse({'detail': 'Authentication credentials were not provided.'}, status=401)

    token_key = auth_header.split(' ', 1)[1] if ' ' in auth_header else ''
    try:
        token_obj = Token.objects.get(key=token_key)
        request.user = token_obj.user
    except Token.DoesNotExist:
        return JsonResponse({'detail': 'Invalid token.'}, status=401)

    files = request.FILES.getlist('files')
    if not files:
        return JsonResponse({'detail': 'No files provided'}, status=400)

    images = []
    for f in files:
        try:
            image_bytes = f.read()
            img = Image.open(BytesIO(image_bytes)).convert('RGB')
            images.append(img)
        except Exception as exc:
            return JsonResponse({'detail': f'Error reading image: {exc}'}, status=400)

    predictor = get_predictor()
    try:
        result = predictor.predict(images=images)
    except Exception as exc:
        return JsonResponse({'detail': str(exc)}, status=500)

    return JsonResponse(result, safe=False)


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('accounts.urls')),
    path('analyze', analyze_view),
]
