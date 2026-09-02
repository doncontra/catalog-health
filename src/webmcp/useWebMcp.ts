import { useEffect, useMemo, useRef } from "react";
import type { CatalogController } from "../hooks/useCatalogController";
import { registerCatalogTools } from "./registerTools";

export function useWebMcp(controller: CatalogController): boolean {
  const available = typeof document.modelContext?.registerTool === "function";
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  const liveController = useMemo(() => new Proxy({} as CatalogController, {
    get: (_target, property: keyof CatalogController) => controllerRef.current[property],
  }), []);
  useEffect(() => {
    const lifecycle = registerCatalogTools(liveController);
    return () => lifecycle?.abort();
  }, [available, liveController]);
  return available;
}
