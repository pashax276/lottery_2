import { toast, Toaster } from 'react-hot-toast';

export const showToast = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  loading: (message: string) => toast.loading(message),
};

export function Toast() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: '#333',
          color: '#fff',
        },
        success: {
          duration: 3000,
          style: {
            background: '#059669',
          },
        },
        error: {
          duration: 4000,
          style: {
            background: '#dc2626',
          },
        },
      }}
    />
  );
}