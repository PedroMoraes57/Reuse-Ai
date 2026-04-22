import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowUpRightFromSquare,
  faCircleCheck,
  faLocationCrosshairs,
  faMapLocationDot,
  faRotateRight,
  faRoute,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import { useEffect } from 'react';
import type { LatLngBoundsExpression } from 'leaflet';
import type { AssistantMapRequest } from '../../services/AssistantApi';
import type { AssistantMapState } from '../../contexts/assistantContextStore';
import 'leaflet/dist/leaflet.css';

function MapViewportSync({
  latitude,
  longitude,
  points,
}: {
  latitude: number;
  longitude: number;
  points: Array<{ latitude: number; longitude: number }>;
}) {
  const map = useMap();

  useEffect(() => {
    const bounds: LatLngBoundsExpression = [
      [latitude, longitude],
      ...points.map(point => [point.latitude, point.longitude] as [number, number]),
    ];

    map.fitBounds(bounds, {
      padding: [24, 24],
      maxZoom: 14,
      animate: true,
    });
  }, [latitude, longitude, map, points]);

  return null;
}

function buildLocationLabel(mapState?: AssistantMapState) {
  const location = mapState?.nearbyResponse?.search_location;
  const parts = [location?.city, location?.state_code || location?.state].filter(Boolean);
  return parts.join(' · ');
}

interface AssistantLocationMapCardProps {
  messageId: string;
  mapRequest: AssistantMapRequest;
  mapState?: AssistantMapState;
  onRetry: (messageId: string) => void;
}

export function AssistantLocationMapCard({
  messageId,
  mapRequest,
  mapState,
  onRetry,
}: AssistantLocationMapCardProps) {
  const status = mapState?.status ?? 'idle';
  const nearbyResponse = mapState?.nearbyResponse ?? null;
  const locationLabel = buildLocationLabel(mapState);

  if (status === 'idle' || status === 'requesting_permission' || status === 'loading_points') {
    const title =
      status === 'requesting_permission'
        ? 'Solicitando sua localizacao'
        : status === 'loading_points'
          ? 'Buscando pontos proximos'
          : 'Mapa de descarte';
    const description =
      status === 'requesting_permission'
        ? 'Assim que voce permitir a localizacao, eu mostro no mapa os pontos mais proximos.'
        : status === 'loading_points'
          ? 'Estou procurando locais proximos para descarte desse item.'
          : mapRequest.prompt ||
            'Posso mostrar no mapa lugares proximos para descarte desse item.';

    return (
      <div className='mt-3 rounded-xl border border-teal-100 bg-white/80 p-3 dark:border-teal-800/40 dark:bg-zinc-900/70'>
        <div className='flex items-start gap-3'>
          <span className='mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-300'>
            <FontAwesomeIcon
              icon={status === 'loading_points' ? faRoute : faMapLocationDot}
              className='text-sm'
            />
          </span>
          <div className='min-w-0'>
            <p className='text-sm font-semibold text-slate-800 dark:text-zinc-100'>
              {title}
            </p>
            <p className='mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400'>
              {description}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (
    status === 'denied' ||
    status === 'unsupported' ||
    status === 'error'
  ) {
    return (
      <div className='mt-3 rounded-xl border border-amber-100 bg-amber-50/80 p-3 dark:border-amber-700/30 dark:bg-amber-900/10'>
        <div className='flex items-start gap-3'>
          <span className='mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'>
            <FontAwesomeIcon icon={faTriangleExclamation} className='text-sm' />
          </span>
          <div className='min-w-0'>
            <p className='text-sm font-semibold text-amber-900 dark:text-amber-100'>
              Nao consegui abrir o mapa agora
            </p>
            <p className='mt-1 text-xs leading-5 text-amber-800/90 dark:text-amber-100/80'>
              {mapState?.error ||
                'Tente novamente para buscar pontos proximos com base na sua localizacao.'}
            </p>
            {status !== 'unsupported' && (
              <button
                type='button'
                onClick={() => {
                  void onRetry(messageId);
                }}
                className='mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 dark:border-amber-600/40 dark:bg-zinc-900 dark:text-amber-200 dark:hover:bg-amber-900/20'
              >
                <FontAwesomeIcon icon={faRotateRight} />
                Tentar novamente
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!nearbyResponse) {
    return null;
  }

  return (
    <div className='mt-3 rounded-xl border border-teal-100 bg-white/90 p-3 dark:border-teal-800/40 dark:bg-zinc-900/80'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex items-center gap-2 text-teal-700 dark:text-teal-300'>
            <FontAwesomeIcon icon={faCircleCheck} className='text-xs' />
            <p className='text-sm font-semibold'>
              Locais proximos para {mapRequest.item_label}
            </p>
          </div>
          <p className='mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400'>
            {locationLabel
              ? `Buscando ao redor de ${locationLabel}.`
              : 'Buscando ao redor da sua localizacao atual.'}
          </p>
        </div>
        <button
          type='button'
          onClick={() => {
            void onRetry(messageId);
          }}
          className='grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'
          aria-label='Atualizar mapa'
          title='Atualizar mapa'
        >
          <FontAwesomeIcon icon={faRotateRight} className='text-xs' />
        </button>
      </div>

      <div className='mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-zinc-700'>
        <MapContainer
          center={[
            nearbyResponse.user_location.latitude,
            nearbyResponse.user_location.longitude,
          ]}
          zoom={13}
          zoomControl={false}
          className='h-52 w-full'
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          />
          <ZoomControl position='bottomright' />
          <MapViewportSync
            latitude={nearbyResponse.user_location.latitude}
            longitude={nearbyResponse.user_location.longitude}
            points={nearbyResponse.points}
          />
          <CircleMarker
            center={[
              nearbyResponse.user_location.latitude,
              nearbyResponse.user_location.longitude,
            ]}
            radius={8}
            pathOptions={{
              color: '#0f766e',
              fillColor: '#14b8a6',
              fillOpacity: 0.95,
              weight: 2,
            }}
          >
            <Popup>Voce esta aqui</Popup>
          </CircleMarker>
          {nearbyResponse.points.map(point => (
            <CircleMarker
              key={point.id}
              center={[point.latitude, point.longitude]}
              radius={7}
              pathOptions={{
                color: '#0f172a',
                fillColor: '#38bdf8',
                fillOpacity: 0.9,
                weight: 2,
              }}
            >
              <Popup>
                <div className='min-w-[180px] text-sm'>
                  <p className='font-semibold'>{point.name}</p>
                  {point.address && <p className='mt-1'>{point.address}</p>}
                  <p className='mt-1'>{point.distance_km.toFixed(1)} km de distancia</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className='mt-3 space-y-2'>
        {nearbyResponse.points.length > 0 ? (
          nearbyResponse.points.slice(0, 3).map(point => (
            <div
              key={point.id}
              className='rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/80'
            >
              <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium text-slate-800 dark:text-zinc-100'>
                    {point.name}
                  </p>
                  <p className='mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400'>
                    {point.address || point.acceptance_summary}
                  </p>
                </div>
                <span className='rounded-full bg-sky-50 px-2 py-0.5 text-[0.68rem] font-semibold text-sky-700 dark:bg-sky-900/20 dark:text-sky-300'>
                  {point.distance_km.toFixed(1)} km
                </span>
              </div>
              <div className='mt-2 flex flex-wrap gap-2'>
                <a
                  href={point.directions_url}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1 rounded-full border border-teal-100 bg-white px-2.5 py-1 text-[0.7rem] font-medium text-teal-700 transition hover:bg-teal-50 dark:border-teal-700/40 dark:bg-zinc-900 dark:text-teal-300 dark:hover:bg-teal-900/20'
                >
                  <FontAwesomeIcon icon={faLocationCrosshairs} />
                  Rotas
                </a>
                <a
                  href={point.osm_url}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[0.7rem] font-medium text-slate-600 transition hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                >
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                  Abrir
                </a>
              </div>
            </div>
          ))
        ) : (
          <div className='rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-3 text-xs leading-5 text-slate-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400'>
            Nao encontrei pontos catalogados muito proximos agora, mas voce ainda
            pode tentar atualizar o mapa ou buscar um ecoponto na sua regiao.
          </div>
        )}
      </div>

      {nearbyResponse.warning && (
        <p className='mt-3 text-[0.72rem] leading-5 text-slate-500 dark:text-zinc-400'>
          {nearbyResponse.warning}
        </p>
      )}
    </div>
  );
}
