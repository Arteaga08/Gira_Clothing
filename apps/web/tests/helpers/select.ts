import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Opens a SelectField (its list is portalled to <body>) and picks an option by its visible name. */
const chooseOption = async (field: HTMLElement, option: string | RegExp): Promise<void> => {
  await userEvent.click(field);
  await userEvent.click(screen.getByRole("option", { name: option }));
};

export { chooseOption };
