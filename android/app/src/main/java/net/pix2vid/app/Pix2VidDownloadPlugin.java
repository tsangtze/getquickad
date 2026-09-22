package net.pix2vid.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "Pix2VidDownload")
public class Pix2VidDownloadPlugin extends Plugin {

    @PluginMethod
    public void saveVideo(PluginCall call) {
        String url = call.getString("url");
        String requestedFileName = call.getString("fileName");

        if (url == null || url.trim().isEmpty()) {
            call.reject("Download URL is required.");
            return;
        }

        String fileName =
            sanitizeFileName(requestedFileName);

        ExecutorService executor =
            Executors.newSingleThreadExecutor();

        executor.execute(() -> {
            HttpURLConnection connection = null;
            Uri itemUri = null;

            try {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                    call.reject(
                        "Public Downloads requires Android 10 or newer."
                    );
                    return;
                }

                URL remoteUrl = new URL(url);

                connection =
                    (HttpURLConnection) remoteUrl.openConnection();

                connection.setRequestMethod("GET");
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(120000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();

                int status =
                    connection.getResponseCode();

                if (status < 200 || status >= 300) {
                    throw new IllegalStateException(
                        "Video download failed with HTTP " +
                        status +
                        "."
                    );
                }

                ContentResolver resolver =
                    getContext().getContentResolver();

                ContentValues values =
                    new ContentValues();

                values.put(
                    MediaStore.MediaColumns.DISPLAY_NAME,
                    fileName
                );

                values.put(
                    MediaStore.MediaColumns.MIME_TYPE,
                    "video/mp4"
                );

                values.put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS +
                    "/Pix2Vid"
                );

                values.put(
                    MediaStore.MediaColumns.IS_PENDING,
                    1
                );

                itemUri =
                    resolver.insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        values
                    );

                if (itemUri == null) {
                    throw new IllegalStateException(
                        "Unable to create Downloads entry."
                    );
                }

                try (
                    InputStream input =
                        connection.getInputStream();

                    OutputStream output =
                        resolver.openOutputStream(itemUri)
                ) {
                    if (output == null) {
                        throw new IllegalStateException(
                            "Unable to open Downloads destination."
                        );
                    }

                    byte[] buffer =
                        new byte[64 * 1024];

                    int read;

                    while (
                        (read = input.read(buffer)) != -1
                    ) {
                        output.write(
                            buffer,
                            0,
                            read
                        );
                    }

                    output.flush();
                }

                ContentValues complete =
                    new ContentValues();

                complete.put(
                    MediaStore.MediaColumns.IS_PENDING,
                    0
                );

                resolver.update(
                    itemUri,
                    complete,
                    null,
                    null
                );

                JSObject result =
                    new JSObject();

                result.put(
                    "fileName",
                    fileName
                );

                result.put(
                    "uri",
                    itemUri.toString()
                );

                result.put(
                    "relativePath",
                    "Download/Pix2Vid/" +
                    fileName
                );

                call.resolve(result);
            } catch (Exception error) {
                if (itemUri != null) {
                    try {
                        getContext()
                            .getContentResolver()
                            .delete(
                                itemUri,
                                null,
                                null
                            );
                    } catch (Exception ignored) {}
                }

                call.reject(
                    "Unable to save video to Downloads.",
                    error
                );
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }

                executor.shutdown();
            }
        });
    }

    private String sanitizeFileName(
        String requestedFileName
    ) {
        String fileName =
            requestedFileName == null
                ? ""
                : requestedFileName.trim();

        if (fileName.isEmpty()) {
            fileName =
                "pix2vid-video-" +
                System.currentTimeMillis() +
                ".mp4";
        }

        fileName =
            fileName.replaceAll(
                "[^A-Za-z0-9._-]",
                "_"
            );

        if (!fileName.toLowerCase().endsWith(".mp4")) {
            fileName += ".mp4";
        }

        return fileName;
    }
}