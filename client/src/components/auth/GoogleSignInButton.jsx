import { GoogleLogin } from '@react-oauth/google';

function GoogleSignInButton({ onSuccess, onError, text = 'signin_with' }) {
  return (
    <div className="google-signin-container">
      <GoogleLogin
        onSuccess={onSuccess}
        onError={onError}
        text={text}
        shape="rectangular"
        size="large"
        theme="outline"
        width="300"
      />
    </div>
  );
}

export default GoogleSignInButton;
