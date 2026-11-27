package com.kalpkalbe.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;
import java.util.List;

/**
 * Ana ekran kısayolu (Premium → "Uygulama adı ve ikonu", js/brand.js).
 *
 * Seçilen fotoğraf ve adla ana ekrana bir kısayol koyar; dokununca
 * uygulama açılır. Aynı kimlikle kısayol zaten ana ekrandaysa yeni
 * istek yerine yerindekini günceller (ad / fotoğraf değişir).
 *
 * İkon "adaptive" bitmap olarak verilir: telefon kendi şekline
 * (daire, yuvarlak kare…) kırpar; görünen kısım ortadaki ~%67.
 */
@CapacitorPlugin(name = "HomeShortcut")
public class HomeShortcutPlugin extends Plugin {

    private static final String DEFAULT_ID = "couple";

    @PluginMethod
    public void status(PluginCall call) {

        Context ctx = getContext();
        String id = call.getString("id", DEFAULT_ID);

        JSObject result = new JSObject();
        result.put("supported", ShortcutManagerCompat.isRequestPinShortcutSupported(ctx));
        result.put("pinned", isPinned(ctx, id));

        call.resolve(result);

    }

    @PluginMethod
    public void pin(PluginCall call) {

        Context ctx = getContext();
        String id = call.getString("id", DEFAULT_ID);
        String label = call.getString("label", "Kalp Kalbe");
        String icon = call.getString("icon");

        if (label == null || label.trim().isEmpty()) label = "Kalp Kalbe";
        label = label.trim();

        if (icon == null || icon.isEmpty()) {
            call.reject("Fotoğraf yok", "NO_ICON");
            return;
        }

        Bitmap bitmap;

        try {
            int comma = icon.indexOf(',');
            byte[] bytes = Base64.decode(comma >= 0 ? icon.substring(comma + 1) : icon, Base64.DEFAULT);
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception e) {
            bitmap = null;
        }

        if (bitmap == null) {
            call.reject("Fotoğraf okunamadı", "BAD_ICON");
            return;
        }

        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setAction(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        ShortcutInfoCompat info = new ShortcutInfoCompat.Builder(ctx, id)
            .setShortLabel(label)
            .setLongLabel(label)
            .setIcon(IconCompat.createWithAdaptiveBitmap(bitmap))
            .setIntent(intent)
            .build();

        JSObject result = new JSObject();

        try {

            if (isPinned(ctx, id)) {

                ShortcutManagerCompat.updateShortcuts(ctx, Collections.singletonList(info));

                result.put("updated", true);
                call.resolve(result);
                return;

            }

            if (!ShortcutManagerCompat.isRequestPinShortcutSupported(ctx)) {
                call.reject("Bu telefon ana ekran kısayolunu desteklemiyor", "UNSUPPORTED");
                return;
            }

            boolean asked = ShortcutManagerCompat.requestPinShortcut(ctx, info, null);

            result.put("requested", asked);
            call.resolve(result);

        } catch (Exception e) {

            call.reject(e.getMessage() != null ? e.getMessage() : "Kısayol eklenemedi", "FAILED");

        }

    }

    private boolean isPinned(Context ctx, String id) {

        try {
            List<ShortcutInfoCompat> pinned =
                ShortcutManagerCompat.getShortcuts(ctx, ShortcutManagerCompat.FLAG_MATCH_PINNED);
            for (ShortcutInfoCompat s : pinned) {
                if (id.equals(s.getId())) return true;
            }
        } catch (Exception ignored) {}

        return false;

    }
}
