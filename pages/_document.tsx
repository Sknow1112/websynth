import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
    return (
        <Html lang="en">
            <Head>
                <link
                    rel="icon"
                    type="image/png"
                    href="/websynth/images/logo.png"
                />
                <title>WebSynth</title>
                <meta
                    name="description"
                    content="A web-based synthesizer with sample playback and effects"
                />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <meta name="theme-color" content="#ef4444" />
            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
