// Codice del telefono da mostrare allo staff per il reset del PIN (D56).
// Nel markup: <span data-device-code></span>; dopo aver creato la pagina chiamare fillDeviceCode(element).

import { deviceCode, getDeviceId } from '../lib/device.js';

export function fillDeviceCode(element) {
  const slots = element.querySelectorAll('[data-device-code]');
  if (!slots.length) return;
  getDeviceId()
    .then((id) => slots.forEach((slot) => (slot.textContent = deviceCode(id))))
    .catch(() => slots.forEach((slot) => (slot.textContent = '—')));
}
