export function redactViteLogMessage(message: string): string {
  return message.replace(/([?&]apiToken=)[^&\s]+/gi, "$1[redacted]");
}

