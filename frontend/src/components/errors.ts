import { notifications } from "@mantine/notifications";
import type { TFunction } from "i18next";

import { isApiError } from "../api/client";

/** Show a server error in plain words. Known codes have translations; the rest use the server message. */
export function notifyError(t: TFunction, error: unknown) {
  let message = t("error.body");
  if (isApiError(error)) {
    const key = `apiError.${error.code}`;
    message = t(key, { defaultValue: error.message || message });
  }
  notifications.show({ color: "red", message });
}
