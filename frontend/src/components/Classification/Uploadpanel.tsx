import { useEffect, useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faClipboard,
  faCloudArrowUp,
  faFolderOpen,
  faImage,
  faMagnifyingGlass,
  faTrashCan,
} from '@fortawesome/free-solid-svg-icons';

interface UploadPanelProps {
  onAnalyze: (file: File) => void;
  isLoading: boolean;
}

export function UploadPanel({ onAnalyze, isLoading }: UploadPanelProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewDimensions, setPreviewDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  function updatePreview(nextFile: File) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const nextPreviewUrl = URL.createObjectURL(nextFile);
    previewUrlRef.current = nextPreviewUrl;
    setPreview(nextPreviewUrl);
    setPreviewDimensions(null);
  }

  function handleFile(f: File, options?: { autoAnalyze?: boolean }) {
    if (!f.type.startsWith('image/')) return;
    setFile(f);
    updatePreview(f);
    if (options?.autoAnalyze) {
      onAnalyze(f);
    }
  }

  function handleRemove() {
    setFile(null);
    setPreview(null);
    setPreviewDimensions(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function handleAnalyze() {
    if (file) onAnalyze(file);
  }

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const clipboardItems = Array.from(event.clipboardData?.items ?? []);
      const imageItem = clipboardItems.find(item =>
        item.type.startsWith('image/'),
      );

      if (!imageItem) {
        return;
      }

      const pastedImage = imageItem.getAsFile();
      if (!pastedImage) {
        return;
      }

      event.preventDefault();
      const extension = pastedImage.type.split('/')[1] || 'png';
      const clipboardFile = new File(
        [pastedImage],
        `clipboard-image-${Date.now()}.${extension}`,
        { type: pastedImage.type },
      );

      handleFile(clipboardFile, { autoAnalyze: !isLoading });
      document.getElementById('analisar')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isLoading, onAnalyze]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  return (
    <div className='rounded-[28px] border border-reuseai-verde/10 bg-white p-7 shadow-[0_30px_60px_-45px_rgba(28,28,37,0.45)]'>
      <div className='mb-6 flex items-start gap-3 border-b border-reuseai-verde/10 pb-5'>
        <span className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-reuseai-verde/10 text-base text-reuseai-verde'>
          <FontAwesomeIcon icon={faImage} />
        </span>
        <div>
          <h3 className='text-sm font-bold text-reuseai-preto'>
            Enviar imagem
          </h3>
          <p className='text-xs text-reuseai-cinza/70'>
            Formatos aceitos: JPG, PNG, WEBP. Cole com Ctrl+V para analisar na hora.
          </p>
        </div>
      </div>

      <div
        className={`flex min-h-[220px] cursor-pointer items-center justify-center rounded-[24px] border-2 border-dashed bg-gradient-to-b from-reuseai-verde/5 to-white transition-all duration-200 ${
          isDragging
            ? 'border-reuseai-verde bg-reuseai-verde/10'
            : 'border-reuseai-verde/20'
        }`}
        onDragEnter={e => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={e => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !preview && inputRef.current?.click()}
      >
        {!preview ? (
          <div className='flex flex-col items-center gap-3 px-6 py-8 text-center'>
            <div className='text-5xl leading-none text-reuseai-verde'>
              <FontAwesomeIcon icon={faCloudArrowUp} />
            </div>
            <p className='text-sm font-semibold text-reuseai-preto'>
              Arraste a imagem aqui
            </p>
            <span className='text-xs text-reuseai-cinza/70'>ou</span>
            <button
              type='button'
              onClick={e => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              className='inline-flex items-center gap-2 rounded-full bg-reuseai-verde px-5 py-2.5 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'
            >
              <FontAwesomeIcon icon={faFolderOpen} />
              Selecionar arquivo
            </button>
            <p className='inline-flex items-center gap-2 text-xs text-reuseai-cinza/70'>
              <FontAwesomeIcon icon={faClipboard} />
              Você também pode colar uma imagem com Ctrl+V.
            </p>
          </div>
        ) : (
          <div className='flex w-full flex-col items-center gap-4 p-5'>
            <div className='flex w-full items-center justify-center overflow-hidden rounded-[20px] border border-reuseai-verde/15 bg-reuseai-branco/70 p-3'>
              <img
                src={preview}
                alt='Preview'
                onLoad={event => {
                  setPreviewDimensions({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
                className='h-auto max-h-[32rem] w-auto max-w-full rounded-xl object-contain'
              />
            </div>
            <div className='flex flex-wrap items-center justify-center gap-2 text-center text-xs text-reuseai-cinza/70'>
              {previewDimensions && (
                <span className='rounded-full bg-reuseai-verde/8 px-3 py-1 font-medium text-reuseai-cinza'>
                  {previewDimensions.width} x {previewDimensions.height}px
                </span>
              )}
              <span className='rounded-full bg-reuseai-verde/8 px-3 py-1 font-medium text-reuseai-cinza'>
                A imagem agora é exibida completa, sem corte.
              </span>
            </div>
            <button
              type='button'
              onClick={e => {
                e.stopPropagation();
                handleRemove();
              }}
              className='inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50'
            >
              <FontAwesomeIcon icon={faTrashCan} />
              Remover
            </button>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type='file'
        accept='image/*'
        className='hidden'
        onChange={handleChange}
      />

      <button
        type='button'
        onClick={handleAnalyze}
        disabled={isLoading || !file}
        className='mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-reuseai-verde py-3.5 text-base font-bold text-reuseai-branco transition-all hover:-translate-y-0.5 hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-0'
      >
        <FontAwesomeIcon icon={faMagnifyingGlass} />
        {isLoading ? 'Analisando...' : 'Identificar e Orientar'}
      </button>
    </div>
  );
}
