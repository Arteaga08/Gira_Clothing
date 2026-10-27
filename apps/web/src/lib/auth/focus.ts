/**
 * After a failed client-side check the messages are tied to their inputs, but a keyboard or
 * screen-reader user gets nothing unless focus moves: this sends it to the first invalid field
 * once React has rendered the error state.
 */
const focusFirstInvalid = (form: HTMLFormElement): void => {
  setTimeout(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
};

export { focusFirstInvalid };
