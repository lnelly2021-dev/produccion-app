"use client";
import { createContext, useContext, useState, useCallback } from "react";

interface ConfirmState {
  message: string;
  title: string;
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<{
  confirm: (message: string, title?: string) => Promise<boolean>;
}>({ confirm: async () => false });

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((message: string, title = "Confirmar"): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ message, title, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-base font-black text-gray-800 mb-2">{state.title}</h3>
            <p className="text-sm text-gray-600 mb-6">{state.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => close(false)}
                className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => close(true)}
                className="px-4 py-2 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext).confirm;
