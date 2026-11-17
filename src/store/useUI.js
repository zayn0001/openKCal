import { create } from 'zustand'

let toastTm = null
const TOAST_MS = 2500
const TOAST_ACTION_MS = 5000

export const useUI = create((set, get) => ({
  sheets: [],
  dialog: null,
  toastMsg: '',
  toastAction: null,
  activeTab: 'Diary',
  quickLogMeal: null, // meal when quick log is triggered

  setActiveTab: (tab) => set({ activeTab: tab }),

  openSheet: (render) => {
    const id = crypto.randomUUID()
    const close = () => get().closeSheet(id)
    set((s) => ({ sheets: [...s.sheets, { id, render, close }] }))
    return { id, close }
  },

  closeSheet: (id) => set((s) => ({ sheets: s.sheets.filter((x) => x.id !== id) })),
  closeAllSheets: () => set({ sheets: [] }),

  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),

  toast: (msg, { action, onAction, ms } = {}) => {
    clearTimeout(toastTm)
    const withAction = !!(action && typeof onAction === 'function')
    const dur = ms || (withAction ? TOAST_ACTION_MS : TOAST_MS)
    set({
      toastMsg: msg,
      toastAction: withAction ? { label: action, run: onAction } : null,
    })
    toastTm = setTimeout(() => {
      set({ toastMsg: '', toastAction: null })
    }, dur)
  },

  dismissToast: () => {
    clearTimeout(toastTm)
    set({ toastMsg: '', toastAction: null })
  },

  runToastAction: () => {
    const act = get().toastAction
    if (!act) return
    clearTimeout(toastTm)
    set({ toastMsg: '', toastAction: null })
    act.run()
  },

  openQuickLog: (meal = 'Lunch') => set({ quickLogMeal: meal }),
  closeQuickLog: () => set({ quickLogMeal: null }),
}))
