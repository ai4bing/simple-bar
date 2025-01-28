import * as Uebersicht from "uebersicht";
import * as DataWidget from "./data-widget.jsx";
import * as DataWidgetLoader from "./data-widget-loader.jsx";
import * as Icons from "../icons/icons.jsx";
import useWidgetRefresh from "../../hooks/use-widget-refresh";
import useServerSocket from "../../hooks/use-server-socket";
import { useSimpleBarContext } from "../simple-bar-context.jsx";
import * as Utils from "../../utils";

export { mpdStyles as styles } from "../../styles/components/data/mpd";

const { React } = Uebersicht;

const DEFAULT_REFRESH_FREQUENCY = 10000;

export const Widget = React.memo(() => {
  const ref = React.useRef();
  const { displayIndex, settings } = useSimpleBarContext();
  const { widgets, mpdWidgetOptions } = settings;
  const { mpdWidget } = widgets;
  const {
    refreshFrequency,
    showSpecter,
    mpdBinaryPath,
    mpdHost,
    mpdPort,
    mpdFormatString,
    showOnDisplay,
  } = mpdWidgetOptions;

  const refresh = React.useMemo(
    () =>
      Utils.getRefreshFrequency(refreshFrequency, DEFAULT_REFRESH_FREQUENCY),
    [refreshFrequency]
  );

  const visible =
    Utils.isVisibleOnDisplay(displayIndex, showOnDisplay) && mpdWidget;

  const [state, setState] = React.useState();
  const [loading, setLoading] = React.useState(visible);
  const { volume: _volume } = state || {};
  const defaultVolume = _volume && parseInt(_volume);
  const [volume, setVolume] = React.useState(defaultVolume);
  const [dragging, setDragging] = React.useState(false);

  const resetWidget = () => {
    setState(undefined);
    setLoading(false);
  };

  const getMpd = React.useCallback(async () => {
    if (!visible) return;

    try {
      const [playerState, trackInfo, volumeState] = await Promise.all([
        Uebersicht.run(
          `${mpdBinaryPath} --host ${mpdHost} --port ${mpdPort} | head -n 2 | tail -n 1 | awk '{print substr($1,2,length($1)-2)}' 2>/dev/null || echo "stopped"`
        ),
        Uebersicht.run(
          `${mpdBinaryPath} --host ${mpdHost} --port ${mpdPort} --format "${mpdFormatString}" | head -n 1`
        ),
        Uebersicht.run(
          `${mpdBinaryPath} --host ${mpdHost} --port ${mpdPort} volume | sed -e 's/volume:[ ]*//g' -e 's/%//g'`
        ),
      ]);
      if (Utils.cleanupOutput(trackInfo) === "") {
        setLoading(false);
        return;
      }
      setState({
        playerState: Utils.cleanupOutput(playerState),
        trackInfo: Utils.cleanupOutput(trackInfo),
        volume: Utils.cleanupOutput(volumeState),
      });
      setLoading(false);
    } catch (e) {
      setLoading(false);
    }
  }, [visible, mpdBinaryPath, mpdHost, mpdPort, mpdFormatString]);

  React.useEffect(() => {
    if (!dragging) setSound(mpdBinaryPath, mpdHost, mpdPort, volume);
  }, [dragging, mpdBinaryPath, mpdHost, mpdPort, volume]);

  React.useEffect(() => {
    if (!dragging) setVolume(volume);
  }, [dragging, volume]);

  useServerSocket("mpd", visible, getMpd, resetWidget, setLoading);
  useWidgetRefresh(visible, getMpd, refresh);

  if (loading) return <DataWidgetLoader.Widget className="mpd" />;
  if (!state) return null;
  const { playerState, trackInfo } = state;

  if (!trackInfo.length) return null;

  const isPlaying = playerState === "playing";
  const Icon = isPlaying ? Icons.Playing : Icons.Paused;

  const onClick = async (e) => {
    Utils.clickEffect(e);
    await togglePlay(mpdBinaryPath, mpdHost, mpdPort);
    await getMpd();
  };

  const onChange = (e) => {
    const value = parseInt(e.target.value);
    setVolume(value);
  };

  const onMouseDown = () => setDragging(true);

  const onMouseUp = () => setDragging(false);

  const stopPropagation = (e) => e.stopPropagation();

  const onMouseEnter = () =>
    Utils.startSliding(ref.current, ".mpd__inner", ".mpd__info");
  const onMouseLeave = () => Utils.stopSliding(ref.current, ".mpd__slider");

  const classes = Utils.classNames("sound", "mpd", {
    "mpd--playing": isPlaying,
    "mpd--dragging": dragging,
  });

  return (
    <DataWidget.Widget
      classes={classes}
      Icon={Icon}
      onClick={onClick}
      showSpecter={showSpecter && isPlaying}
      disableSlider
    >
      <div
        ref={ref}
        className="mpd__outer"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="mpd__inner">
          <div className="mpd__info">{trackInfo}</div>
        </div>
        <div className="mpd__slider-container" onClick={stopPropagation}>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={volume}
            className="mpd__slider"
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onChange={onChange}
          />
        </div>
      </div>
    </DataWidget.Widget>
  );
});

Widget.displayName = "Mpd";

async function togglePlay(path, host, port) {
  return Uebersicht.run(`${path} --host ${host} --port ${port} toggle`);
}

function setSound(path, host, port, volume) {
  if (!volume) return;
  Uebersicht.run(`${path} --host ${host} --port ${port} volume ${volume}`);
}
