import { AuditAction, AuditModule } from "@gira/shared";
import { getUploadService, type UploadedImage } from "../adapters/upload/index.js";
import { assertImageSignature } from "../utils/imageSignature.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * Business wrapper over UploadService — the only thing controllers call.
 * Verifies real image bytes (not just the client-declared MIME) before
 * anything reaches the provider.
 */

const uploadImage = async (
  file: { buffer: Buffer; mimetype: string },
  folder: string,
  ctx: RequestContext,
): Promise<UploadedImage> => {
  assertImageSignature(file.buffer, file.mimetype);

  const image = await getUploadService().upload({
    buffer: file.buffer,
    mimeType: file.mimetype,
    folder,
  });

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.IMAGE_UPLOADED,
    module: AuditModule.CATALOG,
    targetId: image.publicId,
    ip: ctx.ip,
  });

  return image;
};

export { uploadImage };
