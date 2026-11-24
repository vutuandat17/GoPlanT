import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { ActivityIndicator } from 'react-native';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { router } from 'expo-router';
import { SafeAreaView } from '@/components/app-primitives';
import type { SvgProps } from 'react-native-svg';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { apiRequest, ApiError, forgotPassword, isApiConfigured, resendVerificationEmail, resetPassword, type ApiUser, type AuthResult } from '@/services/api';
import { LEGAL_DOCUMENTS, type LegalDocumentKey } from '@/features/auth/legalDocuments';
import { useAuthSession } from '@/features/auth/AuthSession';
import RegisterPot from '@/assets/images/figma/auth/signup/signup-23ac7.svg';
import RegisterLeaf from '@/assets/images/figma/auth/signup/signup-30c2d.svg';
import UserIcon from '@/assets/images/figma/auth/signup/signup-eecde.svg';
import MailIcon from '@/assets/images/figma/auth/signup/signup-130e3.svg';
import InfoIcon from '@/assets/images/figma/auth/signup/signup-949a5.svg';
import LockIcon from '@/assets/images/figma/auth/signup/signup-ce71f.svg';
import EyeIcon from '@/assets/images/figma/auth/signup/signup-289be.svg';
import ShieldIcon from '@/assets/images/figma/auth/signup/signup-a7ee7.svg';
import RegisterActionIcon from '@/assets/images/figma/auth/signup/signup-c0ac2.svg';
import ProfileIcon from '@/assets/images/figma/auth/signup/signup-59e02.svg';
import LoginPlant from '@/assets/images/figma/auth/login/login-c77aa.svg';
import LoginLeaf from '@/assets/images/figma/auth/login/login-e636a.svg';
import LoginUser from '@/assets/images/figma/auth/login/login-71039.svg';
import LoginLock from '@/assets/images/figma/auth/login/login-7b228.svg';
import LoginEye from '@/assets/images/figma/auth/login/login-26e47.svg';

type IconType = ComponentType<SvgProps>;

function ScreenHeader({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerButton} />
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={[styles.headerButton, styles.profileButton]}>
        <ProfileIcon width={16} height={16} />
      </View>
    </View>
  );
}

function Field({
  label,
  placeholder,
  icon: Icon,
  value,
  onChangeText,
  error,
  secureTextEntry,
  onToggleSecure,
  keyboardType,
  optional,
}: {
  label: string;
  placeholder: string;
  icon: IconType;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  secureTextEntry?: boolean;
  onToggleSecure?: () => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  optional?: boolean;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optional ? <Text style={styles.optionalPill}>An toàn</Text> : <Text style={styles.required}>*</Text>}
      </View>
      <View style={[styles.inputShell, error && styles.inputError]}>
        <Icon width={17} height={17} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.mutedText}
          style={styles.input}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
          autoCorrect={false}
        />
        {onToggleSecure ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Hiện hoặc ẩn mật khẩu" onPress={onToggleSecure} style={styles.eyeButton}>
            <EyeIcon width={18} height={14} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function InlineUnavailable(message: string) {
  Alert.alert('Chưa kết nối dịch vụ', message);
}

export function RegisterScreen() {
  const { signIn } = useAuthSession();
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [canResendVerification, setCanResendVerification] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState<{ title: string; message: string; autoSignedIn: boolean } | null>(null);
  const [legalDoc, setLegalDoc] = useState<LegalDocumentKey | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showValidationSummary, setShowValidationSummary] = useState(false);
  const activeLegalDoc = legalDoc ? LEGAL_DOCUMENTS[legalDoc] : null;

  const strength = useMemo(() => {
    if (!password) return 0;
    if (password.length < 12) return 1;
    let score = 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/\d|[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  }, [password]);

  const submit = async () => {
    if (isSubmitting) return;
    setSubmitError('');
    setCanResendVerification(false);
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Vui lòng nhập họ và tên.';
    const normalizedAccount = account.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedAccount) next.account = 'Vui lòng nhập email.';
    else if (!emailPattern.test(normalizedAccount)) {
      next.account = 'Email chưa đúng định dạng.';
    }
    if (password.length < 12) next.password = 'Mật khẩu cần có ít nhất 12 ký tự.';
    if (!confirm || confirm !== password) next.confirm = 'Mật khẩu xác nhận chưa khớp.';
    if (!accepted) next.terms = 'Vui lòng đồng ý với điều khoản để tiếp tục.';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setShowValidationSummary(true);
    } else {
      if (!isApiConfigured) {
        setSubmitError('Chưa cấu hình EXPO_PUBLIC_API_URL để đăng ký tài khoản bằng backend.');
        return;
      }
      setIsSubmitting(true);
      try {
        const registration = await apiRequest<{ verificationToken?: string; message: string; verificationRequired?: boolean }>('/api/v1/auth/register', {
          method: 'POST',
          body: { displayName: name.trim(), email: normalizedAccount, password },
        });
        if (!registration.verificationRequired) {
          const auth = await apiRequest<AuthResult>('/api/v1/auth/login', {
            method: 'POST',
            body: { email: normalizedAccount, password },
          });
          setPassword('');
          setConfirm('');
          await signIn(
            {
              id: auth.user.id,
              email: auth.user.email,
              name: auth.user.displayName,
              role: auth.user.roles.includes('admin') ? 'admin' : auth.user.roles.includes('moderator') ? 'moderator' : 'user',
              avatarUpdatedAt: auth.user.avatarUpdatedAt ?? null,
            },
            auth.accessToken,
            auth.refreshToken,
          );
          setRegisterSuccess({
            title: 'Đăng ký thành công',
            message: 'Tài khoản đã được kích hoạt và đăng nhập sẵn sàng. Nhấn để bắt đầu chăm sóc vườn xanh của bạn.',
            autoSignedIn: true,
          });
          return;
        }
        setPassword('');
        setConfirm('');
        if (registration.verificationToken) {
          await apiRequest<void>('/api/v1/auth/verify-email', { method: 'POST', body: { token: registration.verificationToken } });
          setRegisterSuccess({
            title: 'Đăng ký thành công',
            message: 'Email đã được xác minh trong môi trường phát triển. Bạn có thể đăng nhập ngay.',
            autoSignedIn: false,
          });
        } else {
          setRegisterSuccess({
            title: 'Đã gửi email xác minh',
            message: 'Vui lòng mở hộp thư của bạn và nhấn nút “Xác minh email” để kích hoạt tài khoản trước khi đăng nhập.',
            autoSignedIn: false,
          });
        }
      } catch (requestError) {
        const message = requestError instanceof ApiError ? requestError.message : 'Không thể đăng ký. Vui lòng thử lại sau.';
        setSubmitError(message);
        if (requestError instanceof ApiError && requestError.status === 409 && message.includes('chưa xác minh')) {
          setCanResendVerification(true);
        }
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleResendVerification = async () => {
    const email = account.trim();
    if (!email || resendingVerification) return;
    setResendingVerification(true);
    try {
      const result = await resendVerificationEmail(email);
      if (result.verificationToken) {
        await apiRequest<void>('/api/v1/auth/verify-email', { method: 'POST', body: { token: result.verificationToken } });
        setSubmitError('');
        setCanResendVerification(false);
        setRegisterSuccess({
          title: 'Xác minh thành công',
          message: 'Email đã được xác minh trong môi trường phát triển. Bạn có thể đăng nhập ngay.',
          autoSignedIn: false,
        });
      } else {
        setSubmitError('');
        setCanResendVerification(false);
        setRegisterSuccess({
          title: 'Đã gửi lại email xác minh',
          message: result.message,
          autoSignedIn: false,
        });
      }
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : 'Không thể gửi lại email xác minh.');
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScreenHeader title="Đăng ký tài khoản" />
      <ScrollView contentContainerStyle={styles.registerContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.registerHero}>
          <View style={styles.registerLogo}><RegisterPot width={22} height={24} /></View>
          <Text style={styles.registerTitle}>Tạo tài khoản mới</Text>
          <Text style={styles.registerSubtitle}>Bắt đầu hành trình gieo mầm và chăm sóc vườn xanh của riêng bạn</Text>
        </View>

        <View style={styles.factBanner}>
          <View style={styles.factIcon}><RegisterLeaf width={13} height={13} /></View>
          <Text style={styles.factText}>Cùng hơn <Text style={styles.factStrong}>12.000+</Text> người yêu cây số hóa không gian xanh mỗi ngày.</Text>
        </View>

        <View style={styles.form}>
          <Field label="Họ và tên" placeholder="Ví dụ: Nguyễn Văn An" icon={UserIcon} value={name} onChangeText={setName} error={errors.name} />
          <Field label="Email" placeholder="Ví dụ: an@example.com" icon={MailIcon} value={account} onChangeText={setAccount} error={errors.account} keyboardType="email-address" />

          <Field label="Mật khẩu" placeholder="Tối thiểu 12 ký tự" icon={LockIcon} value={password} onChangeText={setPassword} error={errors.password} secureTextEntry={!showPassword} onToggleSecure={() => setShowPassword((value) => !value)} />
          <View style={styles.strengthArea}>
            <View style={styles.strengthBars}>{[1, 2, 3].map((part) => <View key={part} style={[styles.strengthBar, part <= strength && styles.strengthBarActive]} />)}</View>
            <View style={styles.strengthLabels}><Text style={styles.helperText}>Độ mạnh: {strength === 0 ? 'Chưa nhập' : strength === 1 ? 'Yếu' : strength === 2 ? 'Trung bình' : 'Mạnh'}</Text><Text style={styles.helperText}>Tối thiểu 12 ký tự, gồm chữ, số & ký tự đặc biệt</Text></View>
          </View>
          <Field label="Nhập lại mật khẩu" placeholder="Nhập lại mật khẩu đã tạo" icon={ShieldIcon} value={confirm} onChangeText={setConfirm} error={errors.confirm} secureTextEntry={!showPassword} onToggleSecure={() => setShowPassword((value) => !value)} />

          <View style={styles.termsRow}>
            <Pressable
              onPress={() => setAccepted((value) => !value)}
              style={styles.termsCheckHit}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
              accessibilityLabel="Đồng ý điều khoản dịch vụ và chính sách bảo mật">
              <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>{accepted ? <Text style={styles.checkmark}>✓</Text> : null}</View>
            </Pressable>
            <Text style={styles.termsText}>
              <Text onPress={() => setAccepted((value) => !value)}>Tôi đồng ý với </Text>
              <Text accessibilityRole="link" onPress={() => setLegalDoc('tos')} style={styles.inlineLink}>Điều khoản dịch vụ</Text>
              <Text onPress={() => setAccepted((value) => !value)}> và </Text>
              <Text accessibilityRole="link" onPress={() => setLegalDoc('policy')} style={styles.inlineLink}>Chính sách bảo mật</Text>
              <Text onPress={() => setAccepted((value) => !value)}> của MiniApp Quản Lý Cây Trồng.</Text>
            </Text>
          </View>
          {errors.terms ? <Text style={styles.errorText}>{errors.terms}</Text> : null}

          {submitError ? (
            <View style={styles.submitErrorBanner} accessibilityRole="alert">
              <Text style={styles.submitErrorText}>{submitError}</Text>
              {canResendVerification ? (
                <Pressable
                  disabled={resendingVerification}
                  onPress={() => void handleResendVerification()}
                  style={({ pressed }) => [styles.resendInlineBtn, pressed && styles.pressed]}
                  accessibilityRole="button">
                  <Text style={styles.resendInlineText}>
                    {resendingVerification ? 'Đang gửi lại…' : 'Gửi lại email xác minh'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Pressable
            disabled={isSubmitting}
            onPress={submit}
            style={({ pressed }) => [
              styles.submitButton,
              isSubmitting && styles.submitButtonDisabled,
              pressed && !isSubmitting && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}>
            {isSubmitting ? (
              <ActivityIndicator size="small" color={C.surface} />
            ) : (
              <RegisterActionIcon width={15} height={15} />
            )}
            <Text style={styles.submitLabel}>{isSubmitting ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản'}</Text>
          </Pressable>
          <Text style={styles.submitHint}>Sau khi đăng ký thành công sẽ chuyển sang màn hình Đăng nhập</Text>
        </View>

        <View style={styles.gardenTip}>
          <Image source={require('@/assets/images/figma/auth/signup/footer-garden.png')} style={styles.gardenPhoto} resizeMode="cover" />
          <View style={styles.gardenCopy}><Text style={styles.gardenTitle}>Vườn số xanh mát</Text><Text style={styles.gardenText}>Nhận lịch tưới thông minh & chẩn đoán sâu bệnh bằng hình ảnh ngay sau khi vào app.</Text></View>
        </View>
        <Pressable onPress={() => router.replace('/auth/login')} style={styles.switchAuth}>
          <Text style={styles.switchText}>Đã có tài khoản? </Text><Text style={styles.switchAction}>Đăng nhập ngay →</Text>
        </Pressable>
      </ScrollView>
      <Modal visible={showValidationSummary} transparent animationType="fade" onRequestClose={() => setShowValidationSummary(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.validationModal}>
            <View style={styles.modalAccent} />
            <View style={styles.modalContent}>
              <View style={styles.warningIcon}><Text style={styles.warningMark}>!</Text></View>
              <Text style={styles.modalTitle}>Thông tin không hợp lệ, hãy kiểm tra lại</Text>
              <Text style={styles.modalDescription}>Một số trường bắt buộc chưa được nhập hoặc chưa chính xác để tiếp tục.</Text>
              <View style={styles.errorList}>{Object.entries(errors).map(([key, message]) => <View key={key} style={styles.modalErrorRow}><Text style={styles.errorCross}>×</Text><View style={styles.modalErrorCopy}><Text style={styles.modalErrorTitle}>{({ name: 'Họ và tên', account: 'Email', password: 'Mật khẩu', confirm: 'Xác nhận mật khẩu', terms: 'Điều khoản dịch vụ' } as Record<string, string>)[key]}</Text><Text style={styles.modalErrorMessage}>{message}</Text></View></View>)}</View>
              <Pressable onPress={() => setShowValidationSummary(false)} style={styles.modalPrimary}><Text style={styles.modalPrimaryText}>☷  Kiểm tra và sửa lại</Text></Pressable>
              <Pressable onPress={() => setShowValidationSummary(false)} style={styles.modalSecondary}><Text style={styles.modalSecondaryText}>Đóng cảnh báo</Text></Pressable>
              <Text style={styles.modalPrivacy}>GoPlant tôn trọng quyền riêng tư và mầm xanh an toàn</Text>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(registerSuccess)} transparent animationType="fade" onRequestClose={() => setRegisterSuccess(null)}>
        <View style={styles.legalModalBackdrop}>
          <View style={styles.successModalCard}>
            <View style={styles.successModalIcon}><Text style={styles.successModalGlyph}>✓</Text></View>
            <Text style={styles.successModalTitle}>{registerSuccess?.title}</Text>
            <Text style={styles.successModalMessage}>{registerSuccess?.message}</Text>
            <Pressable
              onPress={() => {
                const autoSignedIn = Boolean(registerSuccess?.autoSignedIn);
                setRegisterSuccess(null);
                router.replace(autoSignedIn ? '/home' : '/auth/login');
              }}
              style={({ pressed }) => [styles.legalPrimaryBtn, styles.successModalBtn, pressed && styles.pressed]}
              accessibilityRole="button">
              <Text style={styles.legalPrimaryText}>{registerSuccess?.autoSignedIn ? 'Vào Trang chủ' : 'Đi tới đăng nhập'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(activeLegalDoc)} transparent animationType="fade" onRequestClose={() => setLegalDoc(null)}>
        <View style={styles.legalModalBackdrop}>
          <View style={styles.legalModalCard}>
            <View style={styles.legalModalHeader}>
              <View style={styles.legalBadge}><Text style={styles.legalBadgeText}>{activeLegalDoc?.key === 'tos' ? 'ĐIỀU KHOẢN' : 'BẢO MẬT'}</Text></View>
              <Text style={styles.legalModalTitle}>{activeLegalDoc?.title}</Text>
              <Text style={styles.legalUpdatedAt}>{activeLegalDoc?.updatedAt}</Text>
            </View>
            <ScrollView style={styles.legalScroll} contentContainerStyle={styles.legalScrollContent} showsVerticalScrollIndicator>
              <Text style={styles.legalIntro}>{activeLegalDoc?.intro}</Text>
              {activeLegalDoc?.sections.map((section) => (
                <View key={section.heading} style={styles.legalSection}>
                  <Text style={styles.legalSectionTitle}>{section.heading}</Text>
                  {section.paragraphs.map((paragraph, idx) => (
                    <Text key={`${section.heading}-${idx}`} style={styles.legalParagraph}>{paragraph}</Text>
                  ))}
                </View>
              ))}
            </ScrollView>
            <View style={styles.legalModalActions}>
              <Pressable onPress={() => setLegalDoc(null)} style={({ pressed }) => [styles.legalSecondaryBtn, pressed && styles.pressed]} accessibilityRole="button">
                <Text style={styles.legalSecondaryText}>Đóng</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setAccepted(true);
                  setErrors((current) => {
                    if (!current.terms) return current;
                    const { terms: _removed, ...rest } = current;
                    return rest;
                  });
                  setLegalDoc(null);
                }}
                style={({ pressed }) => [styles.legalPrimaryBtn, pressed && styles.pressed]}
                accessibilityRole="button">
                <Text style={styles.legalPrimaryText}>Tôi đồng ý</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export function LoginScreen() {
  const { signIn } = useAuthSession();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResetPanel, setShowResetPanel] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetStatus, setResetStatus] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetCooldown, setResetCooldown] = useState(0);
  const [canResendVerification, setCanResendVerification] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendNotice, setResendNotice] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (resetCooldown <= 0) return;
    const timer = setTimeout(() => setResetCooldown((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resetCooldown]);

  const loginPasswordStrength = useMemo(() => {
    if (!password) return 0;
    if (password.length < 12) return 1;
    let score = 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/\d|[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  }, [password]);

  const resetPasswordStrength = useMemo(() => {
    if (!resetNewPassword) return 0;
    if (resetNewPassword.length < 12) return 1;
    let score = 1;
    if (/[A-Z]/.test(resetNewPassword) && /[a-z]/.test(resetNewPassword)) score += 1;
    if (/\d|[^A-Za-z0-9]/.test(resetNewPassword)) score += 1;
    return score;
  }, [resetNewPassword]);

  const handleSendReset = async () => {
    if (resetBusy || resetCooldown > 0) return;
    const email = (resetEmail || account).trim();
    if (!email) {
      setResetStatus('Vui lòng nhập email để nhận mã đặt lại mật khẩu.');
      return;
    }
    setResetBusy(true);
    setResetStatus('');
    try {
      const res = await forgotPassword(email);
      if (res.resetToken) setResetToken(res.resetToken);
      setResetCooldown(60);
      setResetStatus(res.message);
    } catch (err) {
      setResetStatus(err instanceof Error ? err.message : 'Không thể gửi yêu cầu đặt lại mật khẩu.');
      if (err instanceof ApiError && err.status === 429 && resetCooldown <= 0) {
        setResetCooldown(60);
      }
    } finally {
      setResetBusy(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!resetToken.trim()) {
      setResetStatus('Nhập mã đặt lại mật khẩu.');
      return;
    }
    if (resetNewPassword.length < 12 || resetNewPassword.length > 72) {
      setResetStatus('Mật khẩu mới cần có từ 12 đến 72 ký tự.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetStatus('Mật khẩu mới và xác nhận mật khẩu chưa khớp.');
      return;
    }
    setResetBusy(true);
    setResetStatus('');
    try {
      await resetPassword({ token: resetToken.trim(), newPassword: resetNewPassword });
      setShowResetPanel(false);
      setResetToken('');
      setResetNewPassword('');
      setResetConfirmPassword('');
      Alert.alert('Đặt lại mật khẩu thành công', 'Bạn có thể đăng nhập bằng mật khẩu mới.');
    } catch (err) {
      setResetStatus(err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu.');
    } finally {
      setResetBusy(false);
    }
  };

  const submit = async () => {
    if (isSubmitting) return;
    const normalizedEmail = account.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail) {
      setError('Vui lòng nhập email.');
      return;
    }
    if (!emailPattern.test(normalizedEmail)) {
      setError('Email chưa đúng định dạng.');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu.');
      return;
    }
    setError('');
    setCanResendVerification(false);
    setResendNotice('');
    setIsSubmitting(true);
    try {
      if (isApiConfigured) {
        const result = await apiRequest<AuthResult>('/api/v1/auth/login', {
          method: 'POST',
          body: { email: normalizedEmail, password },
        });
        const user: ApiUser = result.user;
        setPassword('');
        await signIn({ id: user.id, email: user.email, name: user.displayName, role: user.roles.includes('admin') ? 'admin' : user.roles.includes('moderator') ? 'moderator' : 'user', avatarUpdatedAt: user.avatarUpdatedAt ?? null }, result.accessToken, result.refreshToken);
        router.replace('/home');
        return;
      }
      if (!isApiConfigured) {
        setError('Chưa cấu hình địa chỉ máy chủ. Vui lòng thiết lập EXPO_PUBLIC_API_URL.');
        return;
      }
      setError('Không thể kết nối máy chủ. Vui lòng thử lại.');
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : 'Không thể hoàn tất đăng nhập. Vui lòng thử lại.';
      setError(message);
      if (requestError instanceof ApiError && requestError.status === 403 && message.includes('chưa xác minh')) {
        setCanResendVerification(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginResendVerification = async () => {
    const normalizedEmail = account.trim();
    if (!normalizedEmail || resendingVerification || resendCooldown > 0) return;
    setResendingVerification(true);
    setResendNotice('');
    try {
      const result = await resendVerificationEmail(normalizedEmail);
      if (result.verificationToken) {
        await apiRequest<void>('/api/v1/auth/verify-email', { method: 'POST', body: { token: result.verificationToken } });
        setError('');
        setCanResendVerification(false);
        setResendNotice('Email đã được xác minh trong môi trường phát triển. Bạn có thể bấm Đăng nhập ngay.');
      } else {
        setError('');
        setResendCooldown(60);
        setResendNotice(result.message || 'Liên kết xác minh mới đã được gửi tới email của bạn.');
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không thể gửi lại email xác minh.';
      setError(message);
      if (err instanceof ApiError && err.status === 429 && resendCooldown <= 0) {
        setResendCooldown(60);
      }
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScreenHeader title="Đăng nhập tài khoản" />
      <ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.loginHero}>
          <View style={styles.loginHeroTop}>
            <View style={styles.loginLogo}><LoginPlant width={24} height={27} /></View>
            <View style={styles.loginHeroCopy}>
              <View style={styles.botanicalTag}><LoginLeaf width={10} height={10} /><Text style={styles.botanicalLabel}>BOTANICAL LIVING</Text></View>
              <Text style={styles.loginTitle}>Chào mừng trở lại!</Text>
            </View>
          </View>
          <Text style={styles.loginSubtitle}>Đăng nhập để tiếp tục tưới tắm, theo dõi nhật ký và chăm sóc ốc đảo xanh của bạn mỗi ngày.</Text>
        </View>

        <View style={styles.loginForm}>
          <View style={styles.loginField}>
            <View style={styles.labelRow}><Text style={styles.loginFieldLabel}>Email</Text><Text style={styles.required}>*</Text></View>
            <View style={styles.loginInput}>
              <LoginUser width={17} height={17} />
              <TextInput value={account} onChangeText={(value) => { setAccount(value); setError(''); setCanResendVerification(false); setResendNotice(''); }} placeholder="Ví dụ: an@example.com" placeholderTextColor={C.mutedText} style={styles.loginInputText} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={!isSubmitting} />
            </View>
          </View>
          <View style={styles.loginField}>
            <View style={styles.labelRow}><Text style={styles.loginFieldLabel}>Mật khẩu</Text><Text style={styles.required}>*</Text></View>
            <View style={styles.loginInput}>
              <LoginLock width={15} height={18} />
              <TextInput value={password} onChangeText={(value) => { setPassword(value); setError(''); }} placeholder="Nhập mật khẩu (tối thiểu 12 ký tự)" placeholderTextColor={C.mutedText} style={styles.loginInputText} secureTextEntry={!showPassword} editable={!isSubmitting} />
              <Pressable accessibilityRole="button" accessibilityLabel="Hiện hoặc ẩn mật khẩu" onPress={() => setShowPassword((value) => !value)} style={styles.loginEye}><LoginEye width={18} height={13} /></Pressable>
            </View>
          </View>
          <View style={styles.strengthArea}>
            <View style={styles.strengthBars}>{[1, 2, 3].map((part) => <View key={part} style={[styles.strengthBar, part <= loginPasswordStrength && styles.strengthBarActive]} />)}</View>
            <View style={styles.strengthLabels}>
              <Text style={styles.helperText}>Độ mạnh: {loginPasswordStrength === 0 ? 'Chưa nhập' : loginPasswordStrength === 1 ? 'Yếu' : loginPasswordStrength === 2 ? 'Trung bình' : 'Mạnh'}</Text>
              <Text style={styles.helperText}>Chuẩn tài khoản mới: tối thiểu 12 ký tự</Text>
            </View>
          </View>
          <Pressable
            onPress={() => {
              setShowResetPanel((v) => !v);
              if (!resetEmail && account.trim()) setResetEmail(account.trim());
              setResetStatus('');
            }}
            style={styles.forgotButton}>
            <Text style={styles.forgotText}>{showResetPanel ? 'Đóng khôi phục mật khẩu' : 'Quên mật khẩu?'}</Text>
          </Pressable>
          {showResetPanel ? (
            <View style={styles.resetCard}>
              <Text style={styles.resetTitle}>Khôi phục mật khẩu</Text>
              <TextInput
                value={resetEmail}
                onChangeText={setResetEmail}
                placeholder="Email tài khoản"
                placeholderTextColor={C.mutedText}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.resetInput}
              />
              <Pressable
                disabled={resetBusy || resetCooldown > 0}
                onPress={() => void handleSendReset()}
                style={[styles.resetSecondaryBtn, (resetBusy || resetCooldown > 0) && styles.resendBtnDisabled]}>
                <Text style={styles.resetSecondaryText}>
                  {resetBusy
                    ? 'Đang gửi...'
                    : resetCooldown > 0
                      ? `Gửi lại mã / liên kết (${resetCooldown}s)`
                      : 'Gửi mã / liên kết qua email'}
                </Text>
              </Pressable>
              <TextInput
                value={resetToken}
                onChangeText={setResetToken}
                placeholder="Mã đặt lại mật khẩu (từ email)"
                placeholderTextColor={C.mutedText}
                autoCapitalize="none"
                style={styles.resetInput}
              />
              <TextInput
                value={resetNewPassword}
                onChangeText={setResetNewPassword}
                placeholder="Mật khẩu mới (12–72 ký tự)"
                placeholderTextColor={C.mutedText}
                secureTextEntry
                style={styles.resetInput}
              />
              <TextInput
                value={resetConfirmPassword}
                onChangeText={setResetConfirmPassword}
                placeholder="Nhập lại mật khẩu mới"
                placeholderTextColor={C.mutedText}
                secureTextEntry
                style={styles.resetInput}
              />
              <View style={styles.strengthArea}>
                <View style={styles.strengthBars}>{[1, 2, 3].map((part) => <View key={part} style={[styles.strengthBar, part <= resetPasswordStrength && styles.strengthBarActive]} />)}</View>
                <View style={styles.strengthLabels}>
                  <Text style={styles.helperText}>Độ mạnh: {resetPasswordStrength === 0 ? 'Chưa nhập' : resetPasswordStrength === 1 ? 'Yếu' : resetPasswordStrength === 2 ? 'Trung bình' : 'Mạnh'}</Text>
                  <Text style={styles.helperText}>Tối thiểu 12 ký tự</Text>
                </View>
              </View>
              {resetStatus ? <Text style={styles.resetStatus}>{resetStatus}</Text> : null}
              <Pressable disabled={resetBusy} onPress={() => void handleConfirmReset()} style={styles.resetPrimaryBtn}>
                <Text style={styles.resetPrimaryText}>Xác nhận đặt lại mật khẩu</Text>
              </Pressable>
            </View>
          ) : null}
          {error ? (
            <View style={styles.submitErrorBanner} accessibilityRole="alert">
              <Text style={styles.submitErrorText}>{error}</Text>
            </View>
          ) : null}
          {resendNotice ? (
            <View style={styles.resendNoticeBanner}>
              <Text style={styles.resendNoticeText}>{resendNotice}</Text>
            </View>
          ) : null}
          {canResendVerification ? (
            <Pressable
              disabled={resendingVerification || resendCooldown > 0}
              onPress={() => void handleLoginResendVerification()}
              style={({ pressed }) => [
                styles.resendBtn,
                (resendingVerification || resendCooldown > 0) && styles.resendBtnDisabled,
                pressed && !resendingVerification && resendCooldown <= 0 && styles.pressed,
              ]}>
              <Text style={styles.resendBtnText}>
                {resendingVerification
                  ? 'Đang gửi lại email xác minh...'
                  : resendCooldown > 0
                    ? `Gửi lại email xác minh (${resendCooldown}s)`
                    : 'Gửi lại email xác minh'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            disabled={isSubmitting}
            onPress={submit}
            style={({ pressed }) => [styles.loginSubmit, pressed && !isSubmitting && styles.pressed, isSubmitting && styles.loginSubmitDisabled]}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}>
            {isSubmitting ? <ActivityIndicator size="small" color={C.surface} /> : null}
            <Text style={styles.loginSubmitLabel}>{isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</Text>
            {!isSubmitting ? <View style={styles.loginSubmitIcon}><ProfileIcon width={15} height={15} /></View> : null}
          </Pressable>
          <View style={styles.successHint}><InfoIcon width={14} height={14} /><Text style={styles.helperText}>Đăng nhập bằng tài khoản GoPlant của bạn.</Text></View>

          <View style={styles.orRow}><View style={styles.rule} /><Text style={styles.orText}>HOẶC TIẾP TỤC VỚI</Text><View style={styles.rule} /></View>
          <View style={styles.socialRow}>
            <Pressable onPress={() => InlineUnavailable('Đăng nhập Zalo MiniApp chưa được kết nối.')} style={styles.socialButton}><Text style={styles.zaloMark}>Z</Text><Text style={styles.socialText}>Zalo MiniApp</Text></Pressable>
            <Pressable onPress={() => InlineUnavailable('Đăng nhập Google chưa được kết nối.')} style={styles.socialButton}><Text style={styles.googleMark}>G</Text><Text style={styles.socialText}>Google</Text></Pressable>
          </View>
          <Pressable onPress={() => router.push('/auth/register')} style={styles.createAccount}><Text style={styles.switchText}>Chưa có tài khoản? </Text><Text style={styles.switchAction}>Đăng ký ngay</Text></Pressable>
          <Text style={styles.loginPrivacy}>Bảo mật chuẩn mã hóa thiết bị MiniApp</Text>
          <Text style={styles.loginCopyright}>GoPlant © 2026 • Đồng hành cùng mầm xanh của bạn</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  header: { height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E8F0E9' },
  headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  profileButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.forest },
  headerTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 16, lineHeight: 24 },
  registerContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, gap: 14 },
  registerHero: { alignItems: 'center' },
  registerLogo: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', elevation: 1 },
  registerTitle: { marginTop: 8, color: C.text, fontFamily: F.bold, fontSize: 26, lineHeight: 34, letterSpacing: -0.4, textAlign: 'center' },
  registerSubtitle: { maxWidth: 280, color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 2 },
  factBanner: { minHeight: 48, padding: 8, borderRadius: 12, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 8 },
  factIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(2,52,35,0.1)', alignItems: 'center', justifyContent: 'center' },
  factText: { flex: 1, color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  factStrong: { color: C.forest, fontFamily: F.semiBold },
  form: { gap: 14, paddingTop: 6 },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: C.text, fontFamily: F.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },
  required: { color: C.terracotta, fontFamily: F.semiBold, fontSize: 12, lineHeight: 16 },
  optionalPill: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: 'rgba(153,245,198,0.3)', color: '#004D33', fontFamily: F.bold, fontSize: 10, lineHeight: 14 },
  inputShell: { minHeight: 44, paddingHorizontal: 14, borderRadius: 8, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 1 },
  inputError: { borderWidth: 1, borderColor: '#B42318' },
  input: { flex: 1, paddingVertical: 10, color: C.text, fontFamily: F.regular, fontSize: 14, lineHeight: 20 },
  eyeButton: { width: 30, height: 32, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#B42318', fontFamily: F.regular, fontSize: 11, lineHeight: 16, marginTop: 2 },
  helperRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  helperText: { color: '#7A837D', fontFamily: F.regular, fontSize: 10, lineHeight: 14 },
  strengthArea: { gap: 4, marginTop: -6 },
  strengthBars: { flexDirection: 'row', gap: 4 },
  strengthBar: { height: 6, flex: 1, borderRadius: 4, backgroundColor: '#DDE5DE' },
  strengthBarActive: { backgroundColor: '#69B98C' },
  strengthLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 2 },
  termsCheckHit: { paddingTop: 1 },
  checkbox: { width: 20, height: 20, borderRadius: 5, backgroundColor: '#E3EAE4', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: C.primary },
  checkmark: { color: C.surface, fontFamily: F.bold, fontSize: 14 },
  termsText: { flex: 1, color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 },
  inlineLink: { color: C.primary, fontFamily: F.semiBold, textDecorationLine: 'underline' },
  submitButton: { minHeight: 48, borderRadius: 16, backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 2 },
  submitButtonDisabled: { opacity: 0.65, elevation: 0 },
  submitLabel: { color: C.surface, fontFamily: F.semiBold, fontSize: 16, lineHeight: 24 },
  submitErrorBanner: { padding: 12, borderRadius: 12, backgroundColor: '#FFDAD6', borderWidth: 1, borderColor: 'rgba(186, 26, 26, 0.25)', gap: 8 },
  submitErrorText: { color: '#93000A', fontFamily: F.semiBold, fontSize: 12, lineHeight: 18 },
  resendInlineBtn: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: C.surface },
  resendInlineText: { color: C.primary, fontFamily: F.semiBold, fontSize: 12 },
  submitHint: { marginTop: -6, color: C.secondaryText, fontFamily: F.regular, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  gardenTip: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  gardenPhoto: { width: 48, height: 48, borderRadius: 8 },
  gardenCopy: { flex: 1, gap: 2 },
  gardenTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 12, lineHeight: 16 },
  gardenText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10, lineHeight: 14 },
  switchAuth: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 34 },
  switchText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 14, lineHeight: 20 },
  switchAction: { color: C.forest, fontFamily: F.semiBold, fontSize: 16, lineHeight: 24 },
  loginContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20, gap: 20 },
  loginHero: { padding: 20, borderRadius: 12, backgroundColor: C.softSurface, gap: 8, overflow: 'hidden' },
  loginHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  loginLogo: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  loginHeroCopy: { flex: 1, gap: 4 },
  botanicalTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: 'rgba(161,209,184,0.3)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  botanicalLabel: { color: C.forest, fontFamily: F.bold, fontSize: 10, lineHeight: 14, letterSpacing: 0.5 },
  loginTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  loginSubtitle: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  loginForm: { padding: 20, borderRadius: 12, backgroundColor: C.surface, gap: 14, elevation: 1 },
  loginField: { gap: 4 },
  loginFieldLabel: { color: C.text, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20, letterSpacing: 0.14 },
  loginMeta: { marginLeft: 'auto', color: 'rgba(65,73,68,0.7)', fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  loginInput: { minHeight: 46, paddingHorizontal: 12, borderRadius: 8, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  loginInputText: { flex: 1, paddingVertical: 10, color: C.text, fontFamily: F.regular, fontSize: 14, lineHeight: 20 },
  loginEye: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  forgotButton: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotText: { color: C.primary, fontFamily: F.semiBold, fontSize: 12, lineHeight: 16 },
  resetCard: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, borderWidth: 1, borderColor: '#D0E2D6', gap: 8 },
  resetTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  resetInput: { minHeight: 42, paddingHorizontal: 12, borderRadius: 9, backgroundColor: C.surface, borderWidth: 1, borderColor: '#DDE7DF', color: C.text, fontFamily: F.regular, fontSize: 13 },
  resetSecondaryBtn: { minHeight: 38, borderRadius: 9, backgroundColor: '#E3F0E7', alignItems: 'center', justifyContent: 'center' },
  resetSecondaryText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  resetPrimaryBtn: { minHeight: 42, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  resetPrimaryText: { color: C.surface, fontFamily: F.semiBold, fontSize: 13 },
  resetStatus: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  loginSubmit: { height: 48, borderRadius: 16, backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 2 },
  loginSubmitDisabled: { opacity: 0.65, elevation: 0 },
  resendBtn: { minHeight: 42, borderRadius: 10, backgroundColor: '#E3F0E7', borderWidth: 1, borderColor: '#BDDAC6', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  resendBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 13, lineHeight: 18 },
  resendBtnDisabled: { opacity: 0.6 },
  resendNoticeBanner: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#E5F4EA', borderWidth: 1, borderColor: '#B8DEC4' },
  resendNoticeText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12, lineHeight: 17 },
  loginSubmitLabel: { color: C.surface, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  loginSubmitIcon: { position: 'absolute', right: 10, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  successHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: -6 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  rule: { flex: 1, height: 1, backgroundColor: '#E3EAE4' },
  orText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10, lineHeight: 14 },
  socialRow: { flexDirection: 'row', gap: 8 },
  socialButton: { flex: 1, height: 50, borderRadius: 10, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  socialText: { color: C.text, fontFamily: F.semiBold, fontSize: 12, lineHeight: 18 },
  zaloMark: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0877F9', color: C.surface, fontFamily: F.bold, fontSize: 16, lineHeight: 24, textAlign: 'center' },
  googleMark: { color: '#4285F4', fontFamily: F.bold, fontSize: 20, lineHeight: 24 },
  createAccount: { minHeight: 48, borderRadius: 10, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  loginPrivacy: { color: '#7A837D', fontFamily: F.regular, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 2 },
  loginCopyright: { color: '#BCC7C0', fontFamily: F.regular, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: -14 },
  modalBackdrop: { flex: 1, paddingHorizontal: 24, backgroundColor: 'rgba(21,31,25,0.58)', alignItems: 'center', justifyContent: 'center' },
  validationModal: { width: '100%', maxWidth: 420, overflow: 'hidden', borderRadius: 14, backgroundColor: C.surface, elevation: 10 },
  modalAccent: { height: 5, backgroundColor: '#FF9A65' },
  modalContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 0, alignItems: 'center', gap: 9 },
  warningIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.peach, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  warningMark: { color: '#984416', fontFamily: F.bold, fontSize: 26 },
  modalTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  modalDescription: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  errorList: { width: '100%', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: C.softSurface },
  modalErrorRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DCE7DE' },
  errorCross: { width: 20, height: 20, overflow: 'hidden', borderRadius: 10, backgroundColor: '#FADADA', color: '#B42318', textAlign: 'center', textAlignVertical: 'center', fontFamily: F.bold },
  modalErrorCopy: { flex: 1, gap: 2 },
  modalErrorTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 11 },
  modalErrorMessage: { color: '#B42318', fontFamily: F.regular, fontSize: 10 },
  modalPrimary: { width: '100%', minHeight: 43, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  modalPrimaryText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 },
  modalSecondary: { width: '100%', minHeight: 39, borderRadius: 9, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  modalSecondaryText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 11 },
  modalPrivacy: { marginHorizontal: -16, marginTop: 1, paddingVertical: 6, width: '110%', backgroundColor: '#EEF4EF', color: C.secondaryText, fontFamily: F.semiBold, fontSize: 9, textAlign: 'center' },
  legalModalBackdrop: { flex: 1, paddingHorizontal: 16, paddingVertical: 24, backgroundColor: 'rgba(35, 42, 38, 0.45)', alignItems: 'center', justifyContent: 'center' },
  legalModalCard: { width: '100%', maxWidth: 480, maxHeight: '86%', borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(30, 75, 56, 0.08)', overflow: 'hidden', elevation: 8 },
  legalModalHeader: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, backgroundColor: C.softSurface, borderBottomWidth: 1, borderBottomColor: 'rgba(30, 75, 56, 0.08)', gap: 4 },
  legalBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, backgroundColor: '#BDEDD3' },
  legalBadgeText: { color: C.forest, fontFamily: F.bold, fontSize: 10, letterSpacing: 0.4 },
  legalModalTitle: { color: C.forest, fontFamily: F.bold, fontSize: 17, lineHeight: 24 },
  legalUpdatedAt: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  legalScroll: { maxHeight: 420 },
  legalScrollContent: { paddingHorizontal: 18, paddingVertical: 14, gap: 12 },
  legalIntro: { color: C.text, fontFamily: F.regular, fontSize: 13, lineHeight: 20 },
  legalSection: { padding: 12, borderRadius: 12, backgroundColor: '#F4FBF5', borderWidth: 1, borderColor: 'rgba(30, 75, 56, 0.06)', gap: 6 },
  legalSectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  legalParagraph: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 19 },
  legalModalActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(30, 75, 56, 0.08)', backgroundColor: C.surface },
  legalSecondaryBtn: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  legalSecondaryText: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  legalPrimaryBtn: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  legalPrimaryText: { color: C.surface, fontFamily: F.semiBold, fontSize: 13 },
  successModalCard: { width: '100%', maxWidth: 400, padding: 22, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(30, 75, 56, 0.08)', alignItems: 'center', gap: 10, elevation: 8 },
  successModalIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#BDEDD3', alignItems: 'center', justifyContent: 'center' },
  successModalGlyph: { color: C.forest, fontFamily: F.bold, fontSize: 26 },
  successModalTitle: { color: C.forest, fontFamily: F.bold, fontSize: 18, lineHeight: 24, textAlign: 'center' },
  successModalMessage: { color: C.secondaryText, fontFamily: F.regular, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  successModalBtn: { flex: 0, width: '100%', marginTop: 4 },
  pressed: { opacity: 0.82 },
});
