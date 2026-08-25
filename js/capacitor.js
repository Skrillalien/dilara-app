import { Haptics, ImpactStyle } from "@capacitor/haptics";

window.appHaptics = {

    async light() {

        try {

            await Haptics.impact({
                style: ImpactStyle.Light
            });

        } catch (error) {

            navigator.vibrate?.(10);

        }

    }

};