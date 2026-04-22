declare module "web-push" {
  type PushSubscriptionLike = {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };

  function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string,
  ): void;

  function sendNotification(
    subscription: PushSubscriptionLike,
    payload?: string,
  ): Promise<void>;

  const webpush: {
    setVapidDetails: typeof setVapidDetails;
    sendNotification: typeof sendNotification;
  };

  export default webpush;
}
