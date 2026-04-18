import Swal, { type SweetAlertIcon } from 'sweetalert2';

function isDarkThemeActive() {
  const root = document.documentElement;
  return (
    root.classList.contains('dark') ||
    root.getAttribute('data-theme') === 'dark'
  );
}

function buildSwal() {
  const darkMode = isDarkThemeActive();

  return Swal.mixin({
    buttonsStyling: false,
    customClass: {
      popup: `reuseai-swal-popup ${darkMode ? 'reuseai-swal-popup-dark' : ''}`,
      title: 'reuseai-swal-title',
      htmlContainer: 'reuseai-swal-html',
      actions: 'reuseai-swal-actions',
      confirmButton: 'reuseai-swal-confirm',
      cancelButton: 'reuseai-swal-cancel',
      closeButton: 'reuseai-swal-close',
    },
    backdrop: darkMode ? 'rgba(5, 12, 9, 0.82)' : 'rgba(28, 28, 37, 0.48)',
  });
}

async function showAlert({
  icon,
  title,
  text,
  confirmButtonText = 'Entendi',
}: {
  icon: SweetAlertIcon;
  title: string;
  text: string;
  confirmButtonText?: string;
}) {
  return buildSwal().fire({
    icon,
    title,
    text,
    confirmButtonText,
  });
}

export async function showErrorAlert(title: string, text: string) {
  return showAlert({
    icon: 'error',
    title,
    text,
    confirmButtonText: 'Fechar',
  });
}

export async function showSuccessAlert(title: string, text: string) {
  return showAlert({
    icon: 'success',
    title,
    text,
  });
}

export async function showInfoAlert(title: string, text: string) {
  return showAlert({
    icon: 'info',
    title,
    text,
  });
}

export async function showActionAlert({
  icon = 'info',
  title,
  text,
  confirmButtonText = 'Continuar',
  cancelButtonText = 'Agora não',
}: {
  icon?: SweetAlertIcon;
  title: string;
  text: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
}) {
  const result = await buildSwal().fire({
    icon,
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
  });

  return result.isConfirmed;
}
