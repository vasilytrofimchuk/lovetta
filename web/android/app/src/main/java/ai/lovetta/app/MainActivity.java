package ai.lovetta.app;

import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /*
     * Android 15+ draws apps edge to edge, and the system web view before Chromium 140 neither reports
     * the bottom safe area to the page nor shrinks for the keyboard: buttons ended up under the gesture
     * bar and sticky headers under the status bar. So the app keeps the classic layout instead: the
     * window content is padded by the status bar, the navigation bar (or the keyboard while it is open)
     * and any cutout, and the page sees no insets at all. Capacitor's own handling is off
     * (SystemBars.insetsHandling = "disable" in capacitor.config.json) so the two do not fight.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        View decor = getWindow().getDecorView();
        int bars = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets sys = insets.getInsets(bars);
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(sys.left, sys.top, sys.right, Math.max(sys.bottom, ime.bottom));
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(bars, Insets.NONE)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .build();
        });
        ViewCompat.requestApplyInsets(decor);
    }
}
