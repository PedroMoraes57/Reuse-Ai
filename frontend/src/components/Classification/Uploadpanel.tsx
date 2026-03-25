import { useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';

interface UploadPanelProps {
  onAnalyze: (file: File) => void;
  isLoading: boolean;
}

export function UploadPanel({ onAnalyze, isLoading }: UploadPanelProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    if (!f.type.startsWith('image/')) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function handleRemove() {
    setFile(null);
    setPreview(null);
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

  return (
    <div className='bg-white border border-gray-200 rounded-2xl p-7 shadow-sm'>
      {/* Header */}
      <div className='flex items-start gap-3 mb-6 pb-5 border-b border-gray-200'>
        <span className='w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 text-base flex-shrink-0'>
          <i className='fas fa-image' />
        </span>
        <div>
          <h3 className='text-sm font-bold text-gray-900'>Enviar imagem</h3>
          <p className='text-xs text-gray-400'>
            Formatos aceitos: JPG, PNG, WEBP
          </p>
        </div>
      </div>

      {/* Drop Area */}
      <div
        className={`bg-green-50 border-2 border-dashed rounded-xl min-h-[220px] flex items-center justify-center cursor-pointer transition-all duration-200
          ${isDragging ? 'border-green-500 bg-green-100' : 'border-green-200'}`}
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
          /* Estado vazio */
          <div className='flex flex-col items-center text-center px-6 py-8 gap-3'>
            <div className='text-5xl text-green-500 leading-none'>
              <i className='fas fa-cloud-arrow-up' />
            </div>
            <p className='text-sm font-semibold text-gray-600'>
              Arraste a imagem aqui
            </p>
            <span className='text-xs text-gray-400'>ou</span>
            <button
              type='button'
              onClick={e => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              className='inline-flex items-center gap-2 bg-green-600 text-white font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-green-700 transition-colors'
            >
              <i className='fas fa-folder-open' /> Selecionar arquivo
            </button>
          </div>
        ) : (
          /* Preview */
          <div className='flex flex-col items-center gap-4 p-5 w-full'>
            <img
              src={preview}
              alt='Preview'
              className='max-h-[180px] w-full object-cover rounded-xl border border-green-100'
            />
            <button
              type='button'
              onClick={e => {
                e.stopPropagation();
                handleRemove();
              }}
              className='inline-flex items-center gap-1.5 bg-white border border-red-300 text-red-600 font-semibold text-xs px-4 py-2 rounded-full hover:bg-red-50 transition-colors'
            >
              <i className='fas fa-trash-alt' /> Remover
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

      {/* Botão analisar */}
      <button
        type='button'
        onClick={handleAnalyze}
        disabled={isLoading || !file}
        className='mt-5 w-full flex items-center justify-center gap-2 bg-green-600 text-white font-bold text-base py-3.5 rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 active:translate-y-0'
      >
        <i className='fas fa-magnifying-glass' />
        {isLoading ? 'Analisando...' : 'Identificar e Orientar'}
      </button>
    </div>
  );
}
