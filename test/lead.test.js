import test from "node:test";
import assert from "node:assert/strict";
import { validateLead } from "../api/lead.js";

const validLead = {
  name: "María Torres",
  company: "Comercial Andina S.A.C.",
  email: "maria@example.com",
  phone: "+51 999 888 777",
  message: "Quiero ordenar los contratos de mi empresa.",
  consent: true,
};

test("acepta un lead completo y válido", () => {
  const result = validateLead(validLead);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.lead.name, "María Torres");
});

test("acepta un lead sin mensaje si adjunta diagnóstico", () => {
  const result = validateLead({ ...validLead, message: "", summary: "DIAGNÓSTICO PRELIMINAR..." });
  assert.equal(result.ok, true);
});

test("rechaza correo inválido, nombre corto y falta de consentimiento", () => {
  const result = validateLead({ name: "A", email: "no-es-correo", message: "hola", consent: false });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("email"));
  assert.ok(result.errors.includes("name"));
  assert.ok(result.errors.includes("consent"));
});

test("recorta campos extensos y tolera tipos inesperados", () => {
  const result = validateLead({
    name: "x".repeat(500),
    email: "test@example.com",
    message: { malicioso: true },
    summary: "y".repeat(20000),
    consent: true,
  });
  assert.equal(result.lead.name.length, 120);
  assert.equal(result.lead.summary.length, 8000);
  assert.equal(result.lead.message, "");
});
