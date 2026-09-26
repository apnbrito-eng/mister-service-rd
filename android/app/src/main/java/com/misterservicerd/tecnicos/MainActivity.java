package com.misterservicerd.tecnicos;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.autofill.AutofillManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(AutofillSession.class);
        registerPlugin(VoiceNote.class);
        super.onCreate(state);
        if (getBridge() == null) return;
        View web = getBridge().getWebView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
        }
        // Android 15 enforces edge-to-edge. Capacitor 7 consumes system-bar
        // insets without IME insets, leaving the keyboard over the WebView.
        if (Build.VERSION.SDK_INT >= 35) {
            ViewCompat.setOnApplyWindowInsetsListener(web, (view, insets) -> {
                Insets space = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
                ViewGroup.MarginLayoutParams margins = (ViewGroup.MarginLayoutParams) view.getLayoutParams();
                if (margins.leftMargin != space.left || margins.topMargin != space.top
                    || margins.rightMargin != space.right || margins.bottomMargin != space.bottom) {
                    margins.setMargins(space.left, space.top, space.right, space.bottom);
                    view.setLayoutParams(margins);
                }
                boolean visible = insets.isVisible(WindowInsetsCompat.Type.ime());
                getBridge().getWebView().evaluateJavascript(
                    "document.documentElement.classList.toggle('teclado-nativo', " + visible + ")", null);
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(web);
        }
    }

    @CapacitorPlugin(name = "AutofillSession")
    public static class AutofillSession extends Plugin {
        // Commit only after Firebase confirms login. The OS owns the prompt
        // and credentials; no passwords cross this bridge or enter our storage.
        @PluginMethod public void commit(PluginCall call) {
            getActivity().runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    AutofillManager manager = getActivity().getSystemService(AutofillManager.class);
                    if (manager != null) manager.commit();
                }
                call.resolve();
            });
        }
    }
}
