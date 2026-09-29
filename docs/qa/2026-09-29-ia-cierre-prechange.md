# Cierre del panel IA — PRE-CHANGE

Reporte de Jorge: en Samsung, X/minimizar no cierran; un toque abre selector de módulos y Atrás nativo tampoco cierra IA.

Lectura: AsistenteIAFlotante mantiene hook y borrador al cerrar, tiene callbacks X/minimizar y panel z40 frente toolbar z30. No hay Escape. runtime.ts:35 tiene el único listener App.backButton; navega/minimiza sin consultar paneles. EspacioTrabajo compacto es un select nativo, compatible con la captura pero no prueba de click-through. No atribuir causa táctil hasta reproducir.

Touch-list: AsistenteIAFlotante.tsx, mobile/runtime.ts, nuevo registro local de cierres de overlays; pruebas de cierre y fixture aislado. Se preserva hook, historial, estado/input, permisos y transporte. Sin remount ni nuevas llamadas IA. Un solo listener Capacitor, consulta prioridad local antes de navegación; registro solo mientras panel abierto y limpieza al cerrar/desmontar. Escape y botones comparten cierre. Icono pequeño en área48px. QA375/1440; Samsung requiere APK posterior. Incorporar patrón/cazador para falta de prioridad Atrás confirmada en código.
