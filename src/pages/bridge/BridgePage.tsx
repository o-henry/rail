import BridgePanel from "../../components/BridgePanel";

type BridgePageProps = {
  busy: boolean;
  connectCode: string;
  embedded?: boolean;
  status: Parameters<typeof BridgePanel>[0]["status"];
  onCopyConnectCode: () => void;
  onRefreshStatus: () => void;
  onRestartBridge: () => void;
  onRotateToken: () => void;
};

export default function BridgePage(props: BridgePageProps) {
  return <BridgePanel {...props} />;
}
