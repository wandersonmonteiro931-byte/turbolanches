import turboLogo from "@/assets/turbo-loader.png";
import { cn } from "@/lib/utils";

interface TurboLoaderProps {
  size?: number;
  className?: string;
  fullScreen?: boolean;
}

/**
 * TurboLoader — substitui os spinners circulares em todo o sistema.
 * Mostra o logo Turbo com efeito "enchendo/esvaziando" (pulse de escala/opacidade).
 */
const TurboLoader = ({ size = 96, className, fullScreen = false }: TurboLoaderProps) => {
  const img = (
    <img
      src={turboLogo}
      alt="Carregando"
      style={{ width: size, height: "auto" }}
      className={cn("turbo-loader-img select-none pointer-events-none", className)}
      draggable={false}
    />
  );

  if (fullScreen) {
    return (
      <div className="flex h-full w-full items-center justify-center py-10">
        {img}
      </div>
    );
  }
  return img;
};

export default TurboLoader;
