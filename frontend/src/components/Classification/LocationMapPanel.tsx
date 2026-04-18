import { useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleCheck,
  faArrowUpRightFromSquare,
  faCompass,
  faGlobe,
  faLeaf,
  faLocationCrosshairs,
  faLocationDot,
  faMapLocationDot,
  faRecycle,
  faRotateRight,
  faRoute,
  faShieldHalved,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type {
  ClassificationResult,
  NearbyDisposalPoint,
  NearbyDisposalPointsResponse,
} from '../../services/ClassificationApi';
import { fadeIn, fadeUp, staggerContainer, staggerItem } from '../../utils/animations';
import 'leaflet/dist/leaflet.css';

export interface BrowserLocationState {
  status: 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'error';
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  message?: string;
}

interface LocationMapPanelProps {
  result: ClassificationResult | null;
  locationState: BrowserLocationState;
  nearbyResponse: NearbyDisposalPointsResponse | null;
  nearbyError: string | null;
  isLoadingNearby: boolean;
  onRequestLocation: () => void;
  onRetryNearby: () => void;
}

interface SearchLocation {
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
}

interface ExternalSearchOption {
  label: string;
  query: string;
  url: string;
}

function resolveSearchLocation(
  result: ClassificationResult | null,
  nearbyResponse: NearbyDisposalPointsResponse | null,
): SearchLocation {
  const responseLocation = nearbyResponse?.search_location;
  if (responseLocation?.city || responseLocation?.state || responseLocation?.state_code) {
    return {
      city: responseLocation.city ?? null,
      state: responseLocation.state ?? null,
      stateCode: responseLocation.state_code ?? null,
    };
  }

  const resultLocation = result?.best_match?.location as
    | {
        city?: string | null;
        state_name?: string | null;
        state_code?: string | null;
      }
    | null
    | undefined;

  return {
    city: resultLocation?.city ?? null,
    state: resultLocation?.state_name ?? null,
    stateCode: resultLocation?.state_code ?? null,
  };
}

function externalSearchPresets(result: ClassificationResult | null) {
  const stream = result?.best_match?.disposal_stream;
  if (stream === 'hazardous_medicine') {
    return [
      { label: 'Farmácias', query: 'farmácia descarte medicamento' },
      { label: 'Medicamentos vencidos', query: 'coleta de medicamentos vencidos' },
      { label: 'Drogarias', query: 'drogaria descarte medicamento' },
    ];
  }
  if (stream === 'hazardous_battery') {
    return [
      { label: 'Papa pilha', query: 'papa pilha' },
      { label: 'Pilhas e baterias', query: 'coleta de pilhas e baterias' },
      { label: 'Ecopontos', query: 'ecoponto pilhas' },
    ];
  }
  if (stream === 'hazardous_lamp') {
    return [
      { label: 'Descarte de lâmpadas', query: 'descarte lâmpada' },
      { label: 'Coleta de lâmpadas', query: 'coleta de lâmpadas' },
      { label: 'Ecopontos', query: 'ecoponto lâmpadas' },
    ];
  }
  if (stream === 'recyclable_metal' || stream === 'automotive_waste') {
    return [
      { label: 'Ferro-velho', query: 'ferro velho reciclagem' },
      { label: 'Sucatão', query: 'sucatão reciclagem' },
      { label: 'Metal', query: 'reciclagem de metal' },
    ];
  }
  if (stream === 'e_waste' || stream === 'bulky_e_waste') {
    return [
      { label: 'Eletrônicos', query: 'ecoponto eletrônicos' },
      { label: 'Lixo eletrônico', query: 'lixo eletrônico descarte' },
      { label: 'Eletroeletrônicos', query: 'descarte eletroeletrônicos' },
    ];
  }
  return [
    { label: 'Ecopontos', query: 'ecoponto' },
    { label: 'Coleta seletiva', query: 'coleta seletiva' },
    { label: 'Reciclagem', query: 'centro de reciclagem' },
  ];
}

function buildExternalSearchOptions(
  result: ClassificationResult | null,
  nearbyResponse: NearbyDisposalPointsResponse | null,
): ExternalSearchOption[] {
  const location = resolveSearchLocation(result, nearbyResponse);
  const locationParts = [
    location.city,
    location.stateCode || location.state,
  ].filter(Boolean);

  return externalSearchPresets(result).map(option => {
    const query = [option.query, ...locationParts].join(' ');
    return {
      label: option.label,
      query,
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    };
  });
}

function MapViewportSync({
  userLatitude,
  userLongitude,
  points,
}: {
  userLatitude: number;
  userLongitude: number;
  points: NearbyDisposalPoint[];
}) {
  const map = useMap();

  useEffect(() => {
    const bounds: LatLngBoundsExpression = [
      [userLatitude, userLongitude],
      ...points.map(point => [point.latitude, point.longitude] as [number, number]),
    ];

    if (points.length === 0) {
      map.setView([userLatitude, userLongitude], 14, { animate: true });
      return;
    }

    map.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: 14,
      animate: true,
    });
  }, [map, points, userLatitude, userLongitude]);

  return null;
}

function confidenceBadgeTone(confidence: NearbyDisposalPoint['acceptance_confidence']) {
  if (confidence === 'alta') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100';
  }
  if (confidence === 'media') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/75';
}

function confidenceLabel(confidence: NearbyDisposalPoint['acceptance_confidence']) {
  if (confidence === 'alta') {
    return 'Compatibilidade alta';
  }
  if (confidence === 'media') {
    return 'Compatibilidade média';
  }
  return 'Compatibilidade inicial';
}

function LocationHint({
  title,
  text,
  ctaLabel,
  onClick,
  icon,
}: {
  title: string;
  text: string;
  ctaLabel: string;
  onClick: () => void;
  icon: typeof faMapLocationDot;
}) {
  return (
    <motion.div
      variants={fadeIn}
      initial='hidden'
      animate='visible'
      className='flex min-h-[320px] flex-col items-center justify-center rounded-[26px] border border-dashed border-reuseai-verde/18 bg-gradient-to-br from-reuseai-verde/8 via-white to-reuseai-azulClaro/8 px-6 py-10 text-center dark:border-reuseai-verdeNeon/16 dark:from-[#112016] dark:via-[#101915] dark:to-[#112430]'
    >
      <div className='flex h-16 w-16 items-center justify-center rounded-full bg-reuseai-verde/12 text-2xl text-reuseai-verde dark:bg-reuseai-verdeNeon/12'>
        <FontAwesomeIcon icon={icon} />
      </div>
      <h4 className='mt-5 text-xl font-black text-reuseai-preto dark:text-reuseai-branco'>
        {title}
      </h4>
      <p className='mt-3 max-w-xl text-sm leading-7 text-reuseai-cinza dark:text-white/70'>
        {text}
      </p>
      <button
        type='button'
        onClick={onClick}
        className='mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-reuseai-verde px-5 py-3 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'
      >
        <FontAwesomeIcon icon={faLocationCrosshairs} />
        {ctaLabel}
      </button>
    </motion.div>
  );
}

export function LocationMapPanel({
  result,
  locationState,
  nearbyResponse,
  nearbyError,
  isLoadingNearby,
  onRequestLocation,
  onRetryNearby,
}: LocationMapPanelProps) {
  const hasLocation =
    locationState.status === 'granted' &&
    typeof locationState.latitude === 'number' &&
    typeof locationState.longitude === 'number';
  const hasNearbyPoints = Boolean(nearbyResponse && nearbyResponse.points.length > 0);
  const isUncertainResult = Boolean(result?.uncertain_prediction);
  const userLatitude = locationState.latitude ?? -23.55052;
  const userLongitude = locationState.longitude ?? -46.633308;
  const points = nearbyResponse?.points ?? [];
  const externalSearchOptions = buildExternalSearchOptions(result, nearbyResponse);
  const searchLocation = resolveSearchLocation(result, nearbyResponse);
  const searchLocationLabel = [searchLocation.city, searchLocation.stateCode || searchLocation.state]
    .filter(Boolean)
    .join(' • ');
  const bannerMessage = nearbyError || nearbyResponse?.warning || locationState.message;
  const bannerTone =
    nearbyError || nearbyResponse?.warning
      ? 'warning'
      : hasLocation && locationState.message
        ? 'success'
        : null;

  return (
    <div className='overflow-hidden rounded-[30px] border border-reuseai-verde/10 bg-white/95 shadow-[0_30px_70px_-48px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/95'>
      <div className='border-b border-reuseai-verde/10 bg-gradient-to-r from-reuseai-verde/8 via-white to-reuseai-azulClaro/10 px-6 py-5 dark:border-reuseai-verdeNeon/10 dark:from-[#102014] dark:via-[#101915] dark:to-[#10222d]'>
        <div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
          <div className='flex gap-3'>
            <span className='flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-reuseai-verde/10 text-lg text-reuseai-verde'>
              <FontAwesomeIcon icon={faMapLocationDot} />
            </span>
            <div>
              <p className='inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-reuseai-verde shadow-sm dark:bg-[#0e1612]'>
                <FontAwesomeIcon icon={faCompass} />
                Mapa de descarte
              </p>
              <h3 className='mt-3 text-xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                Locais próximos para levar este item
              </h3>
              <p className='mt-2 max-w-2xl text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                Com sua permissão, usamos sua localização apenas nesta busca para
                destacar pontos próximos e exibir rotas rápidas.
              </p>
            </div>
          </div>

          <div className='flex flex-wrap gap-2'>
            <button
              type='button'
              onClick={onRequestLocation}
              disabled={locationState.status === 'requesting'}
              className='inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-reuseai-verde/15 bg-white px-4 py-2.5 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-reuseai-verdeNeon/15 dark:bg-[#0f1813] dark:text-reuseai-branco dark:hover:bg-[#162019]'
            >
              <FontAwesomeIcon icon={faLocationCrosshairs} />
              {locationState.status === 'requesting'
                ? 'Obtendo localização...'
                : hasLocation
                  ? 'Atualizar localização'
                  : 'Usar minha localização'}
            </button>

            {hasLocation && result?.best_match?.disposal_stream && (
              <button
                type='button'
                onClick={onRetryNearby}
                disabled={isLoadingNearby || isUncertainResult}
                className='inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-reuseai-verde px-4 py-2.5 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
              >
                <FontAwesomeIcon icon={faRotateRight} />
                {isLoadingNearby ? 'Atualizando...' : 'Buscar pontos'}
              </button>
            )}
          </div>
        </div>

        <div className='mt-4 flex flex-wrap items-center gap-2 text-xs'>
          <span
            className={`rounded-full border px-3 py-1.5 font-semibold ${
              hasLocation
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100'
                : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70'
            }`}
          >
            <FontAwesomeIcon icon={faLocationDot} className='mr-2' />
            {hasLocation ? 'Localização autorizada' : 'Localização não autorizada'}
          </span>

          {hasLocation && locationState.accuracyMeters && (
            <span className='rounded-full border border-reuseai-verde/10 bg-white/80 px-3 py-1.5 font-medium text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813] dark:text-white/65'>
              Precisão aproximada de {Math.round(locationState.accuracyMeters)} m
            </span>
          )}

          {result?.best_match?.disposal_stream && !isUncertainResult && (
            <span className='rounded-full border border-reuseai-verde/10 bg-reuseai-verde/5 px-3 py-1.5 font-medium text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813] dark:text-white/65'>
              Fluxo detectado: {nearbyResponse?.stream_label || result.best_match.dropoff}
            </span>
          )}
        </div>
      </div>

      <div className='p-6'>
        <AnimatePresence mode='wait'>
          {!hasLocation && locationState.status !== 'requesting' && (
            <LocationHint
              key='no-location'
              title={
                locationState.status === 'denied'
                  ? 'A localização foi negada neste navegador'
                  : locationState.status === 'unsupported'
                    ? 'Este navegador não oferece geolocalização'
                    : 'Ative sua localização para ver os melhores pontos próximos'
              }
              text={
                locationState.message ||
                'A análise continua funcionando sem localização, mas o mapa só consegue sugerir ecopontos, farmácias ou pontos de coleta próximos depois da sua autorização.'
              }
              ctaLabel={
                locationState.status === 'denied' || locationState.status === 'error'
                  ? 'Tentar novamente'
                  : 'Permitir localização'
              }
              onClick={onRequestLocation}
              icon={faLocationDot}
            />
          )}

          {locationState.status === 'requesting' && (
            <motion.div
              key='requesting'
              variants={fadeIn}
              initial='hidden'
              animate='visible'
              exit='exit'
              className='flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[26px] border border-reuseai-verde/10 bg-gradient-to-br from-reuseai-verde/5 to-reuseai-azulClaro/10'
            >
              <div className='h-12 w-12 animate-spin rounded-full border-4 border-reuseai-verde/10 border-t-reuseai-verde' />
              <p className='text-sm font-semibold text-reuseai-cinza dark:text-white/70'>
                Solicitando acesso à sua localização...
              </p>
            </motion.div>
          )}

          {hasLocation && (
            <motion.div
              key='map'
              variants={staggerContainer}
              initial='hidden'
              animate='visible'
              className='space-y-5'
            >
              {bannerMessage && bannerTone && (
                <motion.div
                  variants={fadeUp}
                  className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                    bannerTone === 'warning'
                      ? 'border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100'
                      : 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100'
                  }`}
                >
                  <FontAwesomeIcon
                    icon={
                      bannerTone === 'warning'
                        ? faTriangleExclamation
                        : faCircleCheck
                    }
                    className='mr-2'
                  />
                  {bannerMessage}
                </motion.div>
              )}

              {isUncertainResult && (
                <motion.div
                  variants={fadeUp}
                  className='rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100'
                >
                  <p className='font-semibold'>
                    A análise ainda não está segura o bastante para sugerir um
                    ponto específico.
                  </p>
                  <p className='mt-1.5'>
                    Tente uma nova foto do item inteiro. Assim que a identificação
                    ficar confiável, o mapa busca os locais mais próximos para o
                    fluxo correto.
                  </p>
                </motion.div>
              )}

              <motion.div
                variants={fadeUp}
                className='overflow-hidden rounded-[26px] border border-reuseai-verde/10 bg-reuseai-branco/70 dark:border-reuseai-verdeNeon/10 dark:bg-[#0d1510]'
              >
                <div className='flex items-center justify-between gap-3 border-b border-reuseai-verde/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:text-white/55'>
                  <span>
                    {hasNearbyPoints
                      ? `${nearbyResponse?.points.length} ponto${nearbyResponse?.points.length === 1 ? '' : 's'} sugerido${nearbyResponse?.points.length === 1 ? '' : 's'}`
                      : 'Sua posição atual'}
                  </span>
                  <span className='text-reuseai-verde'>
                    {result?.best_match?.display_name_pt || 'Aguardando análise'}
                  </span>
                </div>

                <MapContainer
                  center={[userLatitude, userLongitude]}
                  zoom={13}
                  zoomControl={false}
                  scrollWheelZoom
                  className='reuseai-leaflet-map h-[260px] w-full sm:h-[360px]'
                >
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                  />
                  <ZoomControl position='bottomright' />
                  <MapViewportSync
                    userLatitude={userLatitude}
                    userLongitude={userLongitude}
                    points={hasNearbyPoints ? points : []}
                  />

                  <CircleMarker
                    center={[userLatitude, userLongitude]}
                    radius={12}
                    pathOptions={{
                      color: '#2C93CF',
                      weight: 3,
                      fillColor: '#38b6ff',
                      fillOpacity: 0.8,
                    }}
                  >
                    <Popup>
                      <div className='reuseai-map-popup'>
                        <strong>Sua localização</strong>
                        <p>Usada apenas para calcular a proximidade dos pontos.</p>
                      </div>
                    </Popup>
                  </CircleMarker>

                  {points.map((point, index) => (
                    <CircleMarker
                      key={point.id}
                      center={[point.latitude, point.longitude]}
                      radius={index === 0 ? 11 : 9}
                      pathOptions={{
                        color: index === 0 ? '#4a701c' : '#6aa531',
                        weight: 2,
                        fillColor: index === 0 ? '#78d84e' : '#9ad95f',
                        fillOpacity: 0.9,
                      }}
                    >
                      <Popup>
                        <div className='reuseai-map-popup'>
                          <strong>{point.name}</strong>
                          <p>{point.category_label}</p>
                          <p>{point.distance_km.toFixed(1)} km de você</p>
                          {point.address && <p>{point.address}</p>}
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </motion.div>

              {!result && (
                <motion.div
                  variants={fadeUp}
                  className='rounded-2xl border border-reuseai-verde/10 bg-reuseai-verde/5 px-4 py-4 text-sm leading-6 text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813] dark:text-white/70'
                >
                  Sua localização já está pronta. Faça uma análise acima para eu
                  cruzar o resultado com os pontos de descarte mais próximos.
                </motion.div>
              )}

              {result && !isUncertainResult && isLoadingNearby && (
                <motion.div
                  variants={fadeUp}
                  className='flex items-center gap-3 rounded-2xl border border-reuseai-verde/10 bg-reuseai-verde/5 px-4 py-4 text-sm font-medium text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813] dark:text-white/70'
                >
                  <div className='h-5 w-5 animate-spin rounded-full border-2 border-reuseai-verde/20 border-t-reuseai-verde' />
                  Buscando pontos próximos para o fluxo identificado...
                </motion.div>
              )}

              {result && !isUncertainResult && !isLoadingNearby && !hasNearbyPoints && !nearbyError && nearbyResponse?.status === 'ok' && (
                <motion.div
                  variants={fadeUp}
                  className='rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70'
                >
                  <p>
                    Não encontrei pontos próximos com sinal suficiente para este tipo
                    de descarte na base aberta agora.
                  </p>
                  <p className='mt-2'>
                    Para não te deixar sem saída, preparei buscas locais mais fortes
                    no Google Maps{searchLocationLabel ? ` para ${searchLocationLabel}` : ''}.
                  </p>
                  <div className='mt-4 flex flex-wrap gap-2'>
                    {externalSearchOptions.map(option => (
                      <a
                        key={option.query}
                        href={option.url}
                        target='_blank'
                        rel='noreferrer'
                        className='inline-flex items-center justify-center gap-2 rounded-full bg-reuseai-verde px-4 py-2.5 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'
                      >
                        <FontAwesomeIcon icon={faGlobe} />
                        {option.label}
                      </a>
                    ))}
                  </div>
                  <p className='mt-3 text-xs leading-5 text-slate-500 dark:text-white/50'>
                    Isso abre o Google Maps já com a busca pronta, sem depender de API paga dentro da aplicação.
                  </p>
                </motion.div>
              )}

              {hasNearbyPoints && nearbyResponse && (
                <motion.div
                  variants={staggerContainer}
                  initial='hidden'
                  animate='visible'
                  className='space-y-4'
                >
                  <div className='rounded-2xl border border-reuseai-verde/10 bg-gradient-to-r from-reuseai-verde/8 to-reuseai-azulClaro/8 px-4 py-4 dark:border-reuseai-verdeNeon/10 dark:from-[#112016] dark:to-[#10222d]'>
                    <div className='flex flex-wrap items-center gap-2 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                      <FontAwesomeIcon icon={faRecycle} className='text-reuseai-verde' />
                      {nearbyResponse.stream_label}
                    </div>
                    <p className='mt-2 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                      {nearbyResponse.disclaimer}
                    </p>
                  </div>

                  {nearbyResponse.points.map((point, index) => (
                    <motion.div
                      key={point.id}
                      variants={staggerItem}
                      className='rounded-[24px] border border-reuseai-verde/10 bg-white p-5 shadow-[0_20px_45px_-40px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#0d1510]'
                    >
                      <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                        <div>
                          <div className='flex flex-wrap items-center gap-2'>
                            <span className='rounded-full bg-reuseai-verde px-3 py-1.5 text-xs font-bold text-reuseai-branco'>
                              {index === 0 ? 'Melhor opção agora' : `Opção ${index + 1}`}
                            </span>
                            <span
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${confidenceBadgeTone(point.acceptance_confidence)}`}
                            >
                              <FontAwesomeIcon icon={faShieldHalved} className='mr-2' />
                              {confidenceLabel(point.acceptance_confidence)}
                            </span>
                            <span className='rounded-full border border-reuseai-verde/10 bg-reuseai-verde/5 px-3 py-1.5 text-xs font-medium text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#101915] dark:text-white/65'>
                              {point.distance_km.toFixed(1)} km
                            </span>
                            <span className='rounded-full border border-reuseai-azul/10 bg-reuseai-azulClaro/15 px-3 py-1.5 text-xs font-medium text-reuseai-cinza dark:border-reuseai-azul/20 dark:bg-[#10222d] dark:text-white/65'>
                              {point.source}
                            </span>
                          </div>

                          <h4 className='mt-3 text-lg font-black text-reuseai-preto dark:text-reuseai-branco'>
                            {point.name}
                          </h4>
                          <p className='mt-1 text-sm font-medium text-reuseai-verde'>
                            {point.category_label}
                          </p>

                          <p className='mt-3 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                            {point.acceptance_summary}
                          </p>

                          {point.address && (
                            <p className='mt-2 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                              <FontAwesomeIcon
                                icon={faLocationDot}
                                className='mr-2 text-reuseai-verde'
                              />
                              {point.address}
                            </p>
                          )}
                        </div>

                        <div className='flex flex-wrap gap-2 lg:justify-end'>
                          <a
                            href={point.directions_url}
                            target='_blank'
                            rel='noreferrer'
                            className='inline-flex items-center justify-center gap-2 rounded-full bg-reuseai-verde px-4 py-2.5 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'
                          >
                            <FontAwesomeIcon icon={faRoute} />
                            Abrir rota
                          </a>
                          <a
                            href={point.osm_url}
                            target='_blank'
                            rel='noreferrer'
                            className='inline-flex items-center justify-center gap-2 rounded-full border border-reuseai-verde/15 bg-white px-4 py-2.5 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 dark:border-reuseai-verdeNeon/15 dark:bg-[#101915] dark:text-reuseai-branco dark:hover:bg-[#162019]'
                          >
                            <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                            Ver no mapa
                          </a>
                          {point.reference_url && (
                            <a
                              href={point.reference_url}
                              target='_blank'
                              rel='noreferrer'
                              className='inline-flex items-center justify-center gap-2 rounded-full border border-reuseai-azul/15 bg-white px-4 py-2.5 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-azulClaro/10 dark:border-reuseai-azul/20 dark:bg-[#101915] dark:text-reuseai-branco dark:hover:bg-[#162019]'
                            >
                              <FontAwesomeIcon icon={faGlobe} />
                              {point.reference_label || 'Ver fonte'}
                            </a>
                          )}
                        </div>
                      </div>

                      <div className='mt-4 flex flex-wrap gap-2'>
                        {point.match_reasons.map(reason => (
                          <span
                            key={`${point.id}-${reason}`}
                            className='rounded-full border border-reuseai-verde/10 bg-reuseai-verde/5 px-3 py-1.5 text-xs font-medium text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#101915] dark:text-white/65'
                          >
                            <FontAwesomeIcon icon={faLeaf} className='mr-2 text-reuseai-verde' />
                            {reason}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {result && !isUncertainResult && !isLoadingNearby && hasNearbyPoints && externalSearchOptions.length > 0 && (
                <motion.div
                  variants={fadeUp}
                  className='rounded-2xl border border-reuseai-verde/10 bg-gradient-to-r from-white to-reuseai-verde/5 px-4 py-4 dark:border-reuseai-verdeNeon/10 dark:from-[#0d1510] dark:to-[#101d16]'
                >
                  <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
                    <div>
                      <p className='text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                        Busca complementar no navegador
                      </p>
                      <p className='text-sm leading-6 text-reuseai-cinza dark:text-white/65'>
                        Use estas buscas rápidas para comparar ecopontos e empresas locais
                        {searchLocationLabel ? ` em ${searchLocationLabel}` : ''}.
                      </p>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      {externalSearchOptions.map(option => (
                        <a
                          key={`assist-${option.query}`}
                          href={option.url}
                          target='_blank'
                          rel='noreferrer'
                          className='inline-flex items-center justify-center gap-2 rounded-full border border-reuseai-verde/15 bg-white px-4 py-2.5 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 dark:border-reuseai-verdeNeon/15 dark:bg-[#101915] dark:text-reuseai-branco dark:hover:bg-[#162019]'
                        >
                          <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                          {option.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
