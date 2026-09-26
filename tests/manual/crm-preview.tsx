import React from "react";
import { createRoot } from "react-dom/client";
import GestionOrden from "../../src/components/crm/GestionOrden";
import "../../src/index.css";
createRoot(document.getElementById("root")!).render(
  <main className="min-h-screen bg-slate-100 p-6">
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">CRM · prueba aislada</h1>
      <p className="bg-amber-100 p-3 rounded mb-5">
        Datos ficticios. No conecta con Firebase, bancos ni WhatsApp. No envía
        mensajes. Puedes probar notas y entregas ficticias de efectivo; las demás acciones requieren la versión conectada.
      </p>
      <div className="grid md:grid-cols-2 gap-5">
        <article className="bg-white rounded-xl p-5">
          <h2 className="font-bold">Conversación de ejemplo</h2>
          <p className="bg-slate-100 rounded-xl p-3 mt-5">
            Cliente de prueba: Entregué RD$3,000 al técnico para las piezas.
          </p>
          <p className="text-sm text-gray-500 mt-5">
            La ficha de la derecha es el componente real de gestión; sus
            servicios están sustituidos por datos en memoria.
          </p>
        </article>
        <aside className="bg-white rounded-xl p-5">
          <GestionOrden ordenId="demo" />
        </aside>
      </div>
    </div>
  </main>,
);
