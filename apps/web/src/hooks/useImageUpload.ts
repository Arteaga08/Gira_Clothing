"use client";

import type { ImageAttrs } from "@gira/shared";
import { useCallback, useState } from "react";
import { uploadImage, type UploadFolder } from "@/lib/api/adminUploads";
import { isApiError } from "@/lib/api/ApiError";
import { validateImageFile } from "@/lib/catalog/imageFile";

type UploadOutcome = { ok: true; image: ImageAttrs } | { ok: false; message: string };

interface UseImageUpload {
  /** True while any upload is in flight: disable the controls that would race with it. */
  busy: boolean;
  /** Never throws. A bad file or a failed upload comes back as `{ ok: false, message }`. */
  upload: (file: File, folder: UploadFolder) => Promise<UploadOutcome>;
}

const GENERIC_ERROR = "No se pudo subir la imagen. Inténtalo de nuevo.";

/** Uploads one image at a time on request. The file is checked first so an invalid one never leaves the browser. */
const useImageUpload = (): UseImageUpload => {
  const [inFlight, setInFlight] = useState(0);

  const upload = useCallback(async (file: File, folder: UploadFolder): Promise<UploadOutcome> => {
    const invalid = validateImageFile(file);
    if (invalid) return { ok: false, message: invalid };
    setInFlight((count) => count + 1);
    try {
      return { ok: true, image: await uploadImage(file, folder) };
    } catch (failure) {
      return { ok: false, message: isApiError(failure) ? failure.message : GENERIC_ERROR };
    } finally {
      setInFlight((count) => count - 1);
    }
  }, []);

  return { busy: inFlight > 0, upload };
};

export type { UploadOutcome, UseImageUpload };
export { useImageUpload };
