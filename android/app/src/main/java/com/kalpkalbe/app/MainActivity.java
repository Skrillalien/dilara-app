package com.kalpkalbe.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Başka bir uygulamadan (ör. Spotify → Paylaş) gelen metni,
 * Capacitor'ın zaten dinlediği bir bağlantıya çevirir:
 *   kalpkalbe://paylas?text=...
 * Böylece web tarafında App "appUrlOpen" / getLaunchUrl ile
 * okunur (js/nowplaying.js).
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        convertShareIntent(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        convertShareIntent(intent);
        super.onNewIntent(intent);
    }

    private void convertShareIntent(Intent intent) {

        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;

        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return;

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) return;

        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);

        Uri.Builder uri = new Uri.Builder()
            .scheme("kalpkalbe")
            .authority("paylas")
            .appendQueryParameter("text", text);

        if (subject != null && !subject.trim().isEmpty()) {
            uri.appendQueryParameter("subject", subject);
        }

        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(uri.build());
    }
}
