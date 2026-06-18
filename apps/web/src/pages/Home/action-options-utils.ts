import type {
  ApiTaskActionBooleanOption,
  ApiTaskActionOptions
} from "@/api/tasks";

export type PreviewOptionValues = Record<
  string,
  {
    readonly enabled: boolean;
    readonly fields: Record<string, string>;
  }
>;

export function mergePreviewOptionValues(
  options: ApiTaskActionOptions | null,
  currentValues: PreviewOptionValues
): PreviewOptionValues {
  return Object.fromEntries(
    optionEntriesFor(options).map(([optionId, option]) => {
      const currentValue = currentValues[optionId];
      const defaultValue = defaultPreviewOptionValue(option);
      return [
        optionId,
        currentValue == null
          ? defaultValue
          : {
              enabled: currentValue.enabled,
              fields: {
                ...defaultValue.fields,
                ...currentValue.fields
              }
            }
      ];
    })
  );
}

export function areOptionsValid(options: ApiTaskActionOptions | null): boolean {
  return optionEntriesFor(options).every(([optionId, option]) => {
    const fieldsValid = Object.keys(option.fields ?? {}).every(
      (fieldId) => normalizeOptionId(fieldId) === fieldId
    );

    return (
      normalizeOptionId(optionId) === optionId &&
      option.label.trim().length > 0 &&
      fieldsValid
    );
  });
}

export function optionEntriesFor(
  options: ApiTaskActionOptions | null
): ReadonlyArray<[string, ApiTaskActionBooleanOption]> {
  return Object.entries(options ?? {}).filter(
    (entry): entry is [string, ApiTaskActionBooleanOption] => entry[1] != null
  );
}

export function defaultPreviewOptionValue(
  option: ApiTaskActionBooleanOption
): PreviewOptionValues[string] {
  return {
    enabled: option.default,
    fields: Object.fromEntries(
      Object.entries(option.fields ?? {}).map(([fieldId, field]) => [
        fieldId,
        field.default
      ])
    )
  };
}

export function renderOptionPromptText(
  option: ApiTaskActionBooleanOption,
  value: PreviewOptionValues[string]
): string {
  const template = value.enabled
    ? option.prompt?.enabled
    : option.prompt?.disabled;

  if (template == null || template.trim().length === 0) {
    return "";
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_match, fieldId: string) => {
    const field = option.fields?.[fieldId];
    return value.fields[fieldId] ?? field?.default ?? "";
  });
}

export function nextOptionId(options: ApiTaskActionOptions): string {
  return dedupeOptionId("custom-option", options);
}

export function nextFieldId(
  fields: NonNullable<ApiTaskActionBooleanOption["fields"]>
): string {
  return dedupeOptionId("text-field", fields);
}

export function dedupeOptionId(
  preferredId: string,
  existing: Record<string, unknown>
): string {
  if (existing[preferredId] == null) {
    return preferredId;
  }

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${preferredId}-${String(index)}`;
    if (existing[candidate] == null) {
      return candidate;
    }
  }

  return `${preferredId}${String(Date.now())}`;
}

export function normalizeOptionId(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export function humanizeOptionId(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();

  if (words.length === 0) {
    return "Field";
  }

  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function removeRecordKey<TValue>(
  record: Record<string, TValue>,
  key: string
): Record<string, TValue> {
  return Object.fromEntries(
    Object.entries(record).filter(([entryKey]) => entryKey !== key)
  );
}
