import { create } from 'zustand';

/** Archivo capturado en el navegador del broker, a la espera de que lo tome el importador. */
export interface PendingImportFile {
  name: string;
  bytes: Uint8Array;
  walletId?: string;
}

interface PendingImportState {
  file: PendingImportFile | null;
  set(file: PendingImportFile): void;
  /** Devuelve el archivo pendiente (si hay) y lo quita. */
  take(): PendingImportFile | null;
}

export const usePendingImport = create<PendingImportState>((set, get) => ({
  file: null,
  set: (file) => set({ file }),
  take: () => {
    const file = get().file;
    if (file) set({ file: null });
    return file;
  },
}));
