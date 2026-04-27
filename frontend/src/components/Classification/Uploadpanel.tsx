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
import { AnimatePresence, motion } from 'framer-motion';
import { fadeIn, fadeUp } from '../../utils/animations';

interface UploadPanelProps {
  onAnalyze: (file: File) => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  onRequireLogin: () => void;
}

export function UploadPanel({
  onAnalyze,
  isLoading,
  isAuthenticated,
  onRequireLogin,
}: UploadPanelProps) {
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
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }

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

      handleFile(clipboardFile, {
        autoAnalyze: isAuthenticated && !isLoading,
      });
      document.getElementById('analisar')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isAuthenticated, isLoading, onAnalyze]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  return (
    <div data-tutorial='upload-panel' className='rounded-[28px] border border-reuseai-verde/10 bg-white p-7 shadow-[0_30px_60px_-45px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]'>
      <div className='mb-6 flex items-start gap-3 border-b border-reuseai-verde/10 pb-5'>
        <span className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-reuseai-verde/10 text-base text-reuseai-verde'>
          <FontAwesomeIcon icon={faImage} />
        </span>
        <div>
          <h3 className='text-sm font-bold text-reuseai-preto dark:text-reuseai-branco'>
            Enviar imagem
          </h3>
          <p className='text-xs text-reuseai-cinza/70 dark:text-white/55'>
            Formatos aceitos: JPG, PNG, WEBP. Cole com Ctrl+V para analisar na
            hora.
          </p>
        </div>
      </div>

      <motion.div
        className={`flex min-h-[170px] cursor-pointer items-center justify-center rounded-[24px] border-2 border-dashed bg-gradient-to-b from-reuseai-verde/5 to-white transition-all duration-200 dark:to-[#0d1510] sm:min-h-[220px] ${
          isDragging
            ? 'border-reuseai-verde bg-reuseai-verde/10 dark:bg-reuseai-verdeNeon/10'
            : 'border-reuseai-verde/20 dark:border-reuseai-verdeNeon/15'
        }`}
        animate={isDragging ? { scale: 1.01 } : { scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
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
        <AnimatePresence mode='wait'>
          {!preview ? (
            <motion.div
              key='empty'
              variants={fadeIn}
              initial='hidden'
              animate='visible'
              exit='exit'
              className='flex flex-col items-center gap-3 px-6 py-8 text-center'
            >
              <motion.div
                className='text-5xl leading-none text-reuseai-verde'
                animate={isDragging ? { scale: 1.15, rotate: -8 } : { scale: 1, rotate: 0 }}
                transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <FontAwesomeIcon icon={faCloudArrowUp} />
              </motion.div>
              <p className='text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                Arraste a imagem aqui
              </p>
              <span className='text-xs text-reuseai-cinza/70 dark:text-white/55'>
                ou
              </span>
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
              <p className='inline-flex items-center gap-2 text-xs text-reuseai-cinza/70 dark:text-white/55'>
                <FontAwesomeIcon icon={faClipboard} />
                Você também pode colar uma imagem com Ctrl+V.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key='preview'
              variants={fadeUp}
              initial='hidden'
              animate='visible'
              exit='exit'
              className='flex w-full flex-col items-center gap-4 p-5'
            >
              <div className='flex w-full items-center justify-center overflow-hidden rounded-[20px] border border-reuseai-verde/15 bg-reuseai-branco/70 p-3 dark:border-reuseai-verdeNeon/10 dark:bg-[#111a14]/70'>
                <img
                  src={preview}
                  alt='Preview'
                  onLoad={event => {
                    setPreviewDimensions({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    });
                  }}
                  className='h-auto max-h-[20rem] w-auto max-w-full rounded-xl object-contain sm:max-h-[32rem]'
                />
              </div>
              <div className='flex flex-wrap items-center justify-center gap-2 text-center text-xs text-reuseai-cinza/70 dark:text-white/55'>
                {previewDimensions && (
                  <span className='rounded-full bg-reuseai-verde/8 px-3 py-1 font-medium text-reuseai-cinza dark:bg-reuseai-verdeNeon/10 dark:text-white/65'>
                    {previewDimensions.width} x {previewDimensions.height}px
                  </span>
                )}
              </div>
              <button
                type='button'
                onClick={e => {
                  e.stopPropagation();
                  handleRemove();
                }}
                className='inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/15'
              >
                <FontAwesomeIcon icon={faTrashCan} />
                Remover
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <input
        ref={inputRef}
        type='file'
        accept='image/*'
        className='hidden'
        onChange={handleChange}
      />

      <motion.button
        type='button'
        onClick={handleAnalyze}
        disabled={isLoading || !file}
        whileHover={!isLoading && file ? { y: -2 } : {}}
        whileTap={!isLoading && file ? { y: 0, scale: 0.98 } : {}}
        transition={{ duration: 0.15 }}
        className='mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-reuseai-verde py-3.5 text-base font-bold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-50'
      >
        <FontAwesomeIcon icon={faMagnifyingGlass} />
        {isLoading
          ? 'Analisando...'
          : isAuthenticated
            ? 'Identificar e Orientar'
            : 'Entrar para analisar'}
      </motion.button>

      <AnimatePresence>
        {!isAuthenticated && (
          <motion.div
            variants={fadeUp}
            initial='hidden'
            animate='visible'
            exit='exit'
            className='mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100'
          >
            Faça login para liberar a análise da IA. Você ainda pode selecionar ou
            colar uma imagem para pré-visualizar antes de entrar.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
