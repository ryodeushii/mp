import { dark } from "@mp/style/themes/dark.css";
import { ErrorBoundary, lazy, Suspense } from "solid-js";
import { render } from "solid-js/web";
import * as styles from "./main.css";
import { LoadingSpinner } from "./ui/LoadingSpinner";
import { ErrorFallback } from "./ui/ErrorFallback";
import { ClientLogger, LoggerContext } from "./logger";

const App = lazy(() => import("./App"));

document.documentElement.classList.add(dark);

const rootElement = document.querySelector("div#root")!;
rootElement.classList.add(styles.root);

const logger = new ClientLogger();

logger.start();

render(
  () => (
    <LoggerContext.Provider value={logger}>
      <ErrorBoundary fallback={ErrorFallback}>
        <Suspense fallback={<LoadingSpinner />}>
          <App />
        </Suspense>
      </ErrorBoundary>
    </LoggerContext.Provider>
  ),
  rootElement,
);
