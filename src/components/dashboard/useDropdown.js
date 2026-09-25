'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Tiny self-contained dropdown helper.
 *  - Returns ref to attach to the wrapper.
 *  - Auto-closes on outside click + Escape.
 *  - Use closeOn: 'click' when the menu contains <input type="date"> so the
 *    native calendar popup is not destroyed by mousedown outside-close.
 */
export function useDropdown(initial = false, options = {}) {
  const closeOn = options.closeOn === 'click' ? 'click' : 'mousedown';
  const [open, setOpen] = useState(initial);
  const ref = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    if (!open) return undefined;

    function onPointer(e) {
      if (ref.current && !ref.current.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }

    document.addEventListener(closeOn, onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener(closeOn, onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, closeOn]);

  return { open, setOpen, toggle, close, ref };
}
