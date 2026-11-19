import type { AlertButton } from 'react-native';

/** Alert do React Native não aparece na web: usa alert/confirm do navegador. */
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    const text = [title, message].filter(Boolean).join('\n\n');
    if (!buttons || buttons.length < 2) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    const ok = buttons.filter((b) => b.style !== 'cancel').pop() ?? buttons[buttons.length - 1];
    const cancel = buttons.find((b) => b !== ok);
    (window.confirm(text) ? ok : cancel)?.onPress?.();
  },
};
