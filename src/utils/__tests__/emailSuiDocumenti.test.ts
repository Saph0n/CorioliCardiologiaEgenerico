import { describe, expect, it } from "vitest";
import { emailSuiDocumenti } from "../doctorProfile";

describe("email stampata sui documenti", () => {
  it("usa quella scelta per i documenti, per esempio la segreteria", () => {
    expect(
      emailSuiDocumenti({ email: "medico@gmail.com", emailDocumenti: " segreteria@studio.it " }),
    ).toBe("segreteria@studio.it");
  });

  it("se è vuota usa quella dell'account", () => {
    expect(emailSuiDocumenti({ email: "medico@gmail.com", emailDocumenti: "  " })).toBe("medico@gmail.com");
    expect(emailSuiDocumenti({ email: "medico@gmail.com" })).toBe("medico@gmail.com");
    expect(emailSuiDocumenti(null)).toBe("");
  });
});
