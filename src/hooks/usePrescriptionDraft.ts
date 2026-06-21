import { useState, useCallback, useRef, useEffect } from "react";
import type { PrescriptionFormData } from "../types";
import { saveDraft, getDraft, deleteDraft } from "../db";

export interface UsePrescriptionDraftParams {
  dbSupported: boolean | null;
  dbReady: boolean;
  showPrescriptionForm: boolean;
  onShowSyncMessage?: (msg: string, duration?: number) => void;
}

function hasDraftContent(data: PrescriptionFormData): boolean {
  return !!(
    data.patientNo.trim() ||
    data.patientName.trim() ||
    data.rightEye.sphere.trim() ||
    data.leftEye.sphere.trim() ||
    data.rightEye.cylinder.trim() ||
    data.leftEye.cylinder.trim()
  );
}

export function usePrescriptionDraft({
  dbSupported,
  dbReady,
  showPrescriptionForm,
  onShowSyncMessage,
}: UsePrescriptionDraftParams) {
  const [prescriptionDraft, setPrescriptionDraft] = useState<PrescriptionFormData | null>(null);
  const [prescriptionDraftSavedAt, setPrescriptionDraftSavedAt] = useState<string | null>(null);
  const draftKeyRef = useRef<string>("prescription-draft");
  const draftSyncRef = useRef<PrescriptionFormData | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSaveDraft = useCallback(async (data: PrescriptionFormData) => {
    if (!dbSupported || !dbReady) return;
    if (!hasDraftContent(data)) return;
    try {
      await saveDraft(draftKeyRef.current, data);
      setPrescriptionDraftSavedAt(new Date().toISOString());
    } catch {}
  }, [dbSupported, dbReady]);

  const openPrescriptionForm = useCallback(async () => {
    let draftData: PrescriptionFormData | null = null;
    let draftTime: string | null = null;

    if (dbSupported && dbReady) {
      try {
        const saved = await getDraft(draftKeyRef.current);
        if (saved && saved.data) {
          draftData = saved.data as PrescriptionFormData;
          draftTime = saved.savedAt;
        }
      } catch {}
    }

    try {
      const lsRaw = localStorage.getItem(draftKeyRef.current);
      if (lsRaw) {
        const lsParsed = JSON.parse(lsRaw);
        if (lsParsed.data) {
          if (!draftData || (lsParsed.savedAt && draftTime && lsParsed.savedAt > draftTime)) {
            draftData = lsParsed.data as PrescriptionFormData;
            draftTime = lsParsed.savedAt;
          }
          localStorage.removeItem(draftKeyRef.current);
          if (draftData && dbSupported && dbReady) {
            saveDraft(draftKeyRef.current, draftData).catch(() => {});
          }
        }
      }
    } catch {}

    setPrescriptionDraft(draftData);
    setPrescriptionDraftSavedAt(draftTime);
  }, [dbSupported, dbReady]);

  const cancelPrescriptionForm = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (draftSyncRef.current && dbSupported && dbReady) {
      const data = draftSyncRef.current;
      if (hasDraftContent(data)) {
        saveDraft(draftKeyRef.current, data).catch(() => {});
      } else {
        deleteDraft(draftKeyRef.current).catch(() => {});
      }
    }
    setPrescriptionDraft(null);
    setPrescriptionDraftSavedAt(null);
  }, [dbSupported, dbReady]);

  const handlePrescriptionDraftChange = useCallback((data: PrescriptionFormData) => {
    draftSyncRef.current = data;
    if (!dbSupported || !dbReady) return;
    if (!hasDraftContent(data)) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      performSaveDraft(data);
      debounceTimerRef.current = null;
    }, 800);
  }, [dbSupported, dbReady, performSaveDraft]);

  const handlePrescriptionDraftDiscard = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setPrescriptionDraft(null);
    setPrescriptionDraftSavedAt(null);
    deleteDraft(draftKeyRef.current).catch(() => {});
  }, []);

  const finalizeBeforeStepSwitch = useCallback((step: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (showPrescriptionForm && draftSyncRef.current && step !== "initial-exam") {
      const data = draftSyncRef.current;
      if (hasDraftContent(data) && dbSupported && dbReady) {
        saveDraft(draftKeyRef.current, data).catch(() => {});
      }
    }
  }, [showPrescriptionForm, dbSupported, dbReady]);

  const finalizeBeforeRoleSwitch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (showPrescriptionForm && draftSyncRef.current && dbSupported && dbReady) {
      const data = draftSyncRef.current;
      if (hasDraftContent(data)) {
        saveDraft(draftKeyRef.current, data).catch(() => {});
      }
    }
  }, [showPrescriptionForm, dbSupported, dbReady]);

  const cleanupAfterSubmit = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setPrescriptionDraft(null);
    setPrescriptionDraftSavedAt(null);
    draftSyncRef.current = null;
    deleteDraft(draftKeyRef.current).catch(() => {});
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (showPrescriptionForm && draftSyncRef.current) {
        const data = draftSyncRef.current;
        if (hasDraftContent(data)) {
          try {
            localStorage.setItem(
              draftKeyRef.current,
              JSON.stringify({ data, savedAt: new Date().toISOString() })
            );
          } catch {}
        }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [showPrescriptionForm]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    prescriptionDraft,
    prescriptionDraftSavedAt,
    draftKeyRef,
    draftSyncRef,
    setPrescriptionDraft,
    setPrescriptionDraftSavedAt,
    openPrescriptionForm,
    cancelPrescriptionForm,
    handlePrescriptionDraftChange,
    handlePrescriptionDraftDiscard,
    finalizeBeforeStepSwitch,
    finalizeBeforeRoleSwitch,
    cleanupAfterSubmit,
  };
}
