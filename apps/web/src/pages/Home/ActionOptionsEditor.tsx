import { Plus, Trash2 } from "lucide-react";
import type React from "react";
import type {
  ApiTaskActionBooleanOption,
  ApiTaskActionOptions
} from "@/api/tasks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultPreviewOptionValue,
  dedupeOptionId,
  humanizeOptionId,
  nextFieldId,
  nextOptionId,
  normalizeOptionId,
  optionEntriesFor,
  removeRecordKey,
  renderOptionPromptText,
  type PreviewOptionValues
} from "./action-options-utils";

export function ActionOptionsPreview({
  options,
  values,
  onValuesChange
}: {
  readonly options: ApiTaskActionOptions | null;
  readonly values: PreviewOptionValues;
  readonly onValuesChange: (values: PreviewOptionValues) => void;
}): React.JSX.Element | null {
  const optionEntries = optionEntriesFor(options);

  if (optionEntries.length === 0) {
    return null;
  }

  const renderedOptionPrompts = optionEntries
    .map(([optionId, option]) =>
      renderOptionPromptText(option, values[optionId] ?? defaultPreviewOptionValue(option))
    )
    .filter((value) => value.trim().length > 0);

  function updateOptionValue(
    optionId: string,
    value: PreviewOptionValues[string]
  ): void {
    onValuesChange({
      ...values,
      [optionId]: value
    });
  }

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-secondary/20 p-3">
      <h4 className="text-sm font-medium leading-none">Options</h4>
      <div className="grid gap-2">
        {optionEntries.map(([optionId, option]) => {
          const value = values[optionId] ?? defaultPreviewOptionValue(option);
          const fieldEntries = Object.entries(option.fields ?? {});
          return (
            <div
              key={optionId}
              className="grid gap-3 rounded-md border border-border bg-background p-3"
            >
              <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={value.enabled}
                  onChange={(event) =>
                    updateOptionValue(optionId, {
                      ...value,
                      enabled: event.target.checked
                    })
                  }
                />
                <span>{option.label}</span>
              </label>
              {!value.enabled || fieldEntries.length === 0 ? null : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {fieldEntries.map(([fieldId, field]) => (
                    <Field
                      key={fieldId}
                      label={field.label ?? humanizeOptionId(fieldId)}
                      id={`action-preview-option-${optionId}-${fieldId}`}
                    >
                      <Input
                        id={`action-preview-option-${optionId}-${fieldId}`}
                        value={value.fields[fieldId] ?? field.default}
                        disabled={!value.enabled}
                        onChange={(event) =>
                          updateOptionValue(optionId, {
                            ...value,
                            fields: {
                              ...value.fields,
                              [fieldId]: event.target.value
                            }
                          })
                        }
                      />
                    </Field>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {renderedOptionPrompts.length === 0 ? null : (
        <div className="grid gap-2 rounded-md border border-border bg-background p-3">
          <span className="text-sm font-medium">Rendered option prompt text</span>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
            {renderedOptionPrompts.join("\n\n")}
          </pre>
        </div>
      )}
    </section>
  );
}

export function ActionOptionsEditor<
  TDraft extends { readonly options: ApiTaskActionOptions | null }
>({
  draft,
  onDraftChange
}: {
  readonly draft: TDraft;
  readonly onDraftChange: (draft: TDraft) => void;
}): React.JSX.Element {
  const options = draft.options ?? {};
  const optionEntries = optionEntriesFor(options);

  function updateOptions(nextOptions: ApiTaskActionOptions): void {
    onDraftChange({
      ...draft,
      options: Object.keys(nextOptions).length === 0 ? null : nextOptions
    });
  }

  function addCustomOption(): void {
    const optionId = nextOptionId(options);
    updateOptions({
      ...options,
      [optionId]: {
        default: false,
        label: "Custom option",
        prompt: {
          enabled: "## Custom option\nFollow this option-specific instruction."
        },
        type: "boolean"
      }
    });
  }

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h4 className="text-sm font-medium leading-none">Options</h4>
        <Button type="button" variant="outline" size="sm" onClick={addCustomOption}>
          <Plus className="size-4" />
          <span>Add custom option</span>
        </Button>
      </div>

      {optionEntries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background/60 px-3 py-4 text-sm text-muted-foreground">
          No options configured.
        </div>
      ) : (
        <div className="grid gap-3">
          {optionEntries.map(([optionId, option]) => (
            <ActionOptionCard
              key={optionId}
              option={option}
              optionId={optionId}
              options={options}
              onOptionsChange={updateOptions}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActionOptionCard({
  option,
  optionId,
  options,
  onOptionsChange
}: {
  readonly option: ApiTaskActionBooleanOption;
  readonly optionId: string;
  readonly options: ApiTaskActionOptions;
  readonly onOptionsChange: (options: ApiTaskActionOptions) => void;
}): React.JSX.Element {
  const fieldEntries = Object.entries(option.fields ?? {});
  const promptEnabledId = `action-option-${optionId}-prompt-enabled`;
  const promptDisabledId = `action-option-${optionId}-prompt-disabled`;

  function updateOption(nextOption: ApiTaskActionBooleanOption): void {
    onOptionsChange({
      ...options,
      [optionId]: nextOption
    });
  }

  function updateOptionLabel(nextLabel: string): void {
    const nextOption = {
      ...option,
      label: nextLabel
    };
    const normalizedId = normalizeOptionId(nextLabel);
    if (normalizedId.length === 0 || normalizedId === optionId) {
      updateOption(nextOption);
      return;
    }

    const remainingOptions = removeRecordKey(options, optionId);
    onOptionsChange({
      ...remainingOptions,
      [dedupeOptionId(normalizedId, remainingOptions)]: nextOption
    });
  }

  function removeOption(): void {
    onOptionsChange(removeRecordKey(options, optionId));
  }

  function addTextField(): void {
    const fieldId = nextFieldId(option.fields ?? {});
    updateOption({
      ...option,
      fields: {
        ...(option.fields ?? {}),
        [fieldId]: {
          default: "",
          label: "Text field",
          type: "text"
        }
      }
    });
  }

  return (
    <article className="grid gap-4 rounded-md border border-border bg-background p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="truncate text-sm font-medium">{option.label}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={removeOption}
          aria-label={`Remove ${option.label}`}
          title="Remove option"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3">
        <Field label="Label" id={`action-option-${optionId}-label`}>
          <Input
            id={`action-option-${optionId}-label`}
            value={option.label}
            onChange={(event) => updateOptionLabel(event.target.value)}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={option.default}
          onChange={(event) =>
            updateOption({
              ...option,
              default: event.target.checked
            })
          }
        />
        <span>Default on</span>
      </label>

      <div className="grid gap-3">
        <Field label="Enabled prompt" id={promptEnabledId}>
          <Textarea
            id={promptEnabledId}
            className="min-h-32 font-mono"
            value={option.prompt?.enabled ?? ""}
            placeholder="Prompt text to include when this option is checked."
            onChange={(event) =>
              updateOption({
                ...option,
                prompt: {
                  ...(option.prompt ?? {}),
                  enabled: event.target.value
                }
              })
            }
          />
        </Field>
        <Field label="Disabled prompt" id={promptDisabledId}>
          <Textarea
            id={promptDisabledId}
            className="min-h-20 font-mono"
            value={option.prompt?.disabled ?? ""}
            placeholder="Optional prompt text to include when this option is unchecked."
            onChange={(event) =>
              updateOption({
                ...option,
                prompt: {
                  ...(option.prompt ?? {}),
                  enabled: option.prompt?.enabled ?? "",
                  disabled: event.target.value
                }
              })
            }
          />
        </Field>
      </div>

      <div className="grid gap-3 rounded-md border border-border bg-secondary/20 p-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="grid gap-1">
            <h5 className="text-sm font-medium leading-none">Fields</h5>
            <p className="text-sm leading-6 text-muted-foreground">
              Optional text inputs available to this option prompt.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addTextField}>
            <Plus className="size-4" />
            <span>Add field</span>
          </Button>
        </div>
        {fieldEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fields configured.</p>
        ) : (
          <div className="grid gap-3">
            {fieldEntries.map(([fieldId, field]) => (
              <ActionOptionFieldEditor
                key={fieldId}
                field={field}
                fieldId={fieldId}
                option={option}
                onOptionChange={updateOption}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function ActionOptionFieldEditor({
  field,
  fieldId,
  option,
  onOptionChange
}: {
  readonly field: NonNullable<ApiTaskActionBooleanOption["fields"]>[string];
  readonly fieldId: string;
  readonly option: ApiTaskActionBooleanOption;
  readonly onOptionChange: (option: ApiTaskActionBooleanOption) => void;
}): React.JSX.Element {
  function updateFields(
    fields: NonNullable<ApiTaskActionBooleanOption["fields"]>
  ): void {
    onOptionChange(
      Object.keys(fields).length === 0
        ? optionWithoutFields(option)
        : { ...option, fields }
    );
  }

  function updateField(nextField: typeof field): void {
    updateFields({
      ...(option.fields ?? {}),
      [fieldId]: nextField
    });
  }

  function updateFieldLabel(nextLabel: string): void {
    const nextField = {
      ...field,
      label: nextLabel
    };
    const normalizedId = normalizeOptionId(nextLabel);
    if (normalizedId.length === 0 || normalizedId === fieldId) {
      updateField(nextField);
      return;
    }

    const remainingFields = removeRecordKey(option.fields ?? {}, fieldId);
    updateFields({
      ...remainingFields,
      [dedupeOptionId(normalizedId, remainingFields)]: nextField
    });
  }

  function removeField(): void {
    updateFields(removeRecordKey(option.fields ?? {}, fieldId));
  }

  return (
    <div className="grid gap-3 rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {field.label ?? humanizeOptionId(fieldId)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={removeField}
          aria-label={`Remove ${fieldId}`}
          title="Remove field"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Label" id={`action-option-field-${fieldId}-label`}>
          <Input
            id={`action-option-field-${fieldId}-label`}
            value={field.label ?? humanizeOptionId(fieldId)}
            onChange={(event) => updateFieldLabel(event.target.value)}
          />
        </Field>
        <Field label="Type" id={`action-option-field-${fieldId}-type`}>
          <NativeSelect
            id={`action-option-field-${fieldId}-type`}
            value={field.type}
            onChange={() => undefined}
          >
            <option value="text">Text</option>
          </NativeSelect>
        </Field>
        <Field label="Default value" id={`action-option-field-${fieldId}-default`}>
          <Input
            id={`action-option-field-${fieldId}-default`}
            value={field.default}
            onChange={(event) =>
              updateField({
                ...field,
                default: event.target.value
              })
            }
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  children,
  id,
  label
}: {
  readonly children: React.ReactNode;
  readonly id: string;
  readonly label: string;
}): React.JSX.Element {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function optionWithoutFields(
  option: ApiTaskActionBooleanOption
): ApiTaskActionBooleanOption {
  return {
    default: option.default,
    label: option.label,
    ...(option.prompt == null ? {} : { prompt: option.prompt }),
    type: "boolean"
  };
}
