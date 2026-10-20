import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditorSection } from "@/components/catalog/EditorSection";
import { SizePhotoField } from "@/components/catalog/SizePhotoField";
import { ImageTile } from "@/components/catalog/ImageTile";
import { UploadTile } from "@/components/catalog/UploadTile";

describe("ImageTile", () => {
  it("pinta la imagen con su texto alternativo", () => {
    render(<ImageTile url="https://res.cloudinary.com/gira/a.jpg" alt="Foto 1" />);
    expect(screen.getByRole("img", { name: "Foto 1" })).toHaveAttribute("src", "https://res.cloudinary.com/gira/a.jpg");
  });

  it("sin URL, o si la imagen no carga, muestra la marca IMG y no un icono roto", () => {
    const { rerender } = render(<ImageTile url={undefined} alt="" />);
    expect(screen.getByText("IMG")).toBeInTheDocument();
    rerender(<ImageTile url="https://res.cloudinary.com/gira/rota.jpg" alt="Rota" />);
    fireEvent.error(screen.getByRole("img", { name: "Rota" }));
    expect(screen.getByText("IMG")).toBeInTheDocument();
  });
});

describe("UploadTile", () => {
  it("entrega los archivos elegidos y limpia el input para poder repetir el mismo", async () => {
    const onFiles = vi.fn();
    render(<UploadTile label="Subir fotos" multiple onFiles={onFiles} />);
    const input = screen.getByLabelText(/Subir fotos/) as HTMLInputElement;
    const file = new File(["x"], "foto.png", { type: "image/png" });
    await userEvent.upload(input, file);
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(input.value).toBe("");
  });

  it("ocupado o deshabilitado no deja elegir", () => {
    render(<UploadTile label="Subir" busy onFiles={() => {}} />);
    expect(screen.getByText("Subiendo…")).toBeInTheDocument();
    expect(screen.getByLabelText(/Subiendo/)).toBeDisabled();
  });
});

describe("EditorSection", () => {
  it("lleva su título, su pista y su contenido", () => {
    render(
      <EditorSection title="Estampas" hint="Cada una crea una variante" aside={<span>2 elegidas</span>}>
        <p>contenido</p>
      </EditorSection>,
    );
    expect(screen.getByRole("region", { name: "Estampas" })).toBeInTheDocument();
    expect(screen.getByText("Cada una crea una variante")).toBeInTheDocument();
    expect(screen.getByText("2 elegidas")).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });
});

describe("SizePhotoField", () => {
  it("enlaza el error de subida con el input para lectores de pantalla", () => {
    render(<SizePhotoField imageUrl={null} busy={false} error="La imagen pesa más de 5 MB." onPick={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByLabelText(/Subir foto de tamaño/)).toHaveAccessibleDescription("La imagen pesa más de 5 MB.");
  });

  it("sin error el input no declara descripción", () => {
    render(<SizePhotoField imageUrl={null} busy={false} onPick={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByLabelText(/Subir foto de tamaño/)).not.toHaveAttribute("aria-describedby");
  });
});
