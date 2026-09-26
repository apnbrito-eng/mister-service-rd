package com.misterservicerd.tecnicos;

import android.Manifest;
import android.media.MediaRecorder;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.File;
import java.nio.file.Files;

@CapacitorPlugin(name = "VoiceNote", permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) })
public class VoiceNote extends Plugin {
    private MediaRecorder recorder;
    private File file;
    @PluginMethod public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) { requestPermissionForAlias("microphone", call, "permissionResult"); return; }
        begin(call);
    }
    @PermissionCallback private void permissionResult(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) { call.reject("Permite el micrófono para grabar una nota."); return; }
        begin(call);
    }
    private synchronized void begin(PluginCall call) {
        if (recorder != null) { call.reject("Ya hay una grabación activa."); return; }
        try {
            file = File.createTempFile("voice-", ".m4a", getContext().getCacheDir());
            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioChannels(1);
            recorder.setAudioSamplingRate(44100);
            recorder.setAudioEncodingBitRate(64000);
            recorder.setMaxDuration(125000);
            recorder.setOutputFile(file.getAbsolutePath());
            recorder.prepare(); recorder.start(); call.resolve();
        } catch (Exception e) { clear(); call.reject("No se pudo iniciar el micrófono."); }
    }
    @PluginMethod public synchronized void level(PluginCall call) {
        JSObject result = new JSObject();
        try { result.put("active", recorder != null); result.put("amplitude", recorder == null ? 0 : recorder.getMaxAmplitude()); call.resolve(result); }
        catch (Exception e) { call.reject("La grabación se interrumpió."); }
    }
    @PluginMethod public synchronized void stop(PluginCall call) {
        if (recorder == null || file == null) { call.reject("No hay grabación activa."); return; }
        try {
            recorder.stop(); recorder.release(); recorder = null;
            if (file.length() > 2 * 1024 * 1024) throw new Exception("Audio demasiado largo");
            JSObject result = new JSObject(); result.put("audio", Base64.encodeToString(Files.readAllBytes(file.toPath()), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception e) { call.reject("No se pudo completar el audio. Graba de nuevo."); }
        finally { clear(); }
    }
    @PluginMethod public synchronized void cancel(PluginCall call) { clear(); call.resolve(); }
    private synchronized void clear() {
        if (recorder != null) { try { recorder.stop(); } catch (Exception ignored) {} recorder.release(); recorder = null; }
        if (file != null) { file.delete(); file = null; }
    }
    @Override protected void handleOnDestroy() { clear(); }
    @Override protected void handleOnPause() { clear(); }
}
