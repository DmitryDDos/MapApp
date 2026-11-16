/**
 * Логирование операций с базой данных.
 *
 * Информационные сообщения выводятся только в режиме разработки, ошибки —
 * всегда, чтобы их было видно в production-логах (LogBox / logcat / Xcode).
 */

const PREFIX = '[database]';

export const logger = {
  info(message: string, ...details: unknown[]): void {
    if (__DEV__) {
      console.log(`${PREFIX} ${message}`, ...details);
    }
  },
  warn(message: string, ...details: unknown[]): void {
    if (__DEV__) {
      console.warn(`${PREFIX} ${message}`, ...details);
    }
  },
  error(message: string, ...details: unknown[]): void {
    console.error(`${PREFIX} ${message}`, ...details);
  },
};

/** Приводит любое выброшенное значение к `Error`, чтобы им можно было управлять. */
export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(typeof value === 'string' ? value : JSON.stringify(value));
}

/** Человекочитаемое сообщение об ошибке для показа пользователю. */
export function getErrorMessage(value: unknown, fallback = 'Неизвестная ошибка'): string {
  const error = toError(value);
  return error.message || fallback;
}
