import { CSSProperties, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const randomValue = (min: number, max: number): number => Math.random() * (max - min) + min;

const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

const useInterval = (callback: () => void, delay: number | null) => {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
};

export interface LoadingBarProps {
  color?: string;
  shadow?: boolean;
  background?: string;
  height?: number;
  onLoaderFinished?: () => void;
  className?: string;
  containerClassName?: string;
  transitionTime?: number;
  waitingTime?: number;
  style?: CSSProperties;
  containerStyle?: CSSProperties;
  shadowStyle?: CSSProperties;
}

export interface LoadingBarRef {
  continuousStart: (startingValue?: number, refreshRate?: number) => void;
  staticStart: (startingValue?: number) => void;
  complete: () => void;
  getProgress: () => number;
}

const DEFAULT_CONFIG = {
  HEIGHT: 2,
  COLOR: 'red',
  BACKGROUND: 'transparent',
  TRANSITION_TIME: 300,
  WAITING_TIME: 1000,
  REFRESH_RATE: 1000,
  Z_INDEX: 99999999999
};

const LoadingBar = forwardRef<LoadingBarRef, LoadingBarProps>(
  (
    {
      height = DEFAULT_CONFIG.HEIGHT,
      className = '',
      color = DEFAULT_CONFIG.COLOR,
      background = DEFAULT_CONFIG.BACKGROUND,
      onLoaderFinished,
      transitionTime = DEFAULT_CONFIG.TRANSITION_TIME,
      waitingTime = DEFAULT_CONFIG.WAITING_TIME,
      shadow = true,
      containerStyle = {},
      style = {},
      shadowStyle: shadowStyleProp = {},
      containerClassName = ''
    },
    ref
  ) => {
    const [progress, setProgress] = useState(0);
    const [isActive, setIsActive] = useState(false);
    const [isFading, setIsFading] = useState(false);
    const [refreshRate, setRefreshRate] = useState(DEFAULT_CONFIG.REFRESH_RATE);
    const completeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const activeRef = useRef(false);

    useEffect(() => {
      return () => {
        if (completeTimer.current) clearTimeout(completeTimer.current);
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        continuousStart(startingValue = randomInt(10, 20), rate = DEFAULT_CONFIG.REFRESH_RATE) {
          if (completeTimer.current) clearTimeout(completeTimer.current);
          activeRef.current = true;
          setIsActive(true);
          setIsFading(false);
          setRefreshRate(rate);
          setProgress(startingValue);
        },
        staticStart(startingValue = randomInt(30, 60)) {
          if (completeTimer.current) clearTimeout(completeTimer.current);
          activeRef.current = true;
          setIsActive(true);
          setIsFading(false);
          setProgress(startingValue);
        },
        complete() {
          if (!activeRef.current) return;
          if (completeTimer.current) clearTimeout(completeTimer.current);
          setProgress(100);
          completeTimer.current = setTimeout(() => {
            setIsFading(true);
            completeTimer.current = setTimeout(() => {
              activeRef.current = false;
              setIsActive(false);
              setIsFading(false);
              setProgress(0);
              onLoaderFinished?.();
            }, transitionTime);
          }, waitingTime);
        },
        getProgress: () => progress
      }),
      [progress, transitionTime, waitingTime, onLoaderFinished]
    );

    useInterval(
      () => {
        if (progress >= 95) return;
        const remaining = 100 - progress;
        const increment = randomValue(Math.min(10, remaining / 5), Math.min(20, remaining / 3));
        setProgress(prev => Math.min(95, prev + increment));
      },
      isActive && !isFading ? refreshRate : null
    );

    if (!isActive && progress === 0) return null;

    const width = progress >= 100 || isFading ? '100%' : `${progress}%`;
    const opacity = isFading ? 0 : 1;
    const shadowLeft =
      progress >= 90 ? '90%'
      : progress > 0 ? `${progress - 5.5}%`
      : '-10rem';

    const containerStyles: CSSProperties = {
      position: 'fixed',
      top: 0,
      left: 0,
      height,
      background,
      zIndex: DEFAULT_CONFIG.Z_INDEX,
      width: '100%',
      ...containerStyle
    };

    const loaderStyles: CSSProperties = {
      height: '100%',
      background: color,
      width,
      opacity,
      transition:
        isFading ? `opacity ${transitionTime}ms ease-out`
        : progress > 0 ? 'width 0.5s ease'
        : '',
      ...style
    };

    const shadowStyles: CSSProperties = {
      boxShadow: `0 0 10px ${color}, 0 0 5px ${color}`,
      width: '5%',
      opacity: 1,
      position: 'absolute',
      height: '100%',
      transform: 'rotate(2deg) translate(0px, -2px)',
      left: shadowLeft,
      transition: progress > 0 ? 'left 0.5s ease' : '',
      ...shadowStyleProp
    };

    return (
      <div className={containerClassName} style={containerStyles}>
        <div className={className} style={loaderStyles}>
          {shadow && <div style={shadowStyles} />}
        </div>
      </div>
    );
  }
);

LoadingBar.displayName = 'LoadingBar';

export default LoadingBar;
