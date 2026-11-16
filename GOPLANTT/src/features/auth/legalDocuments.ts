export type LegalDocumentKey = 'tos' | 'policy';

export type LegalSection = {
  heading: string;
  paragraphs: string[];
};

export type LegalDocument = {
  key: LegalDocumentKey;
  title: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentKey, LegalDocument> = {
  tos: {
    key: 'tos',
    title: 'ĐIỀU KHOẢN DỊCH VỤ GOPLANT',
    updatedAt: 'Cập nhật lần cuối: [16/11/2026]',
    intro:
      'Chào mừng bạn đến với GoPlant. Khi tạo tài khoản hoặc sử dụng ứng dụng GoPlant (trên thiết bị di động hoặc trình duyệt web), bạn xác nhận đã đọc, hiểu và đồng ý tuân thủ các Điều khoản dịch vụ dưới đây.',
    sections: [
      {
        heading: '1. Phạm vi dịch vụ',
        paragraphs: [
          'GoPlant là ứng dụng hỗ trợ quản lý cây trồng và khu vườn cá nhân, bao gồm các tính năng:',
          '• Tra cứu danh mục cây trồng và thông tin thực vật học tham khảo;',
          '• Tạo và quản lý khu vườn, danh sách cây sở hữu;',
          '• Lập lịch chăm sóc, theo dõi công việc hàng ngày và ghi nhật ký chăm sóc kèm hình ảnh;',
          '• Xem thông tin thời tiết và cảnh báo nhiệt độ cho khu vườn của bạn.',
        ],
      },
      {
        heading: '2. Tài khoản và bảo mật',
        paragraphs: [
          '• Để sử dụng đầy đủ tính năng cá nhân, bạn cần đăng ký tài khoản bằng họ tên, địa chỉ email hợp lệ và xác minh email theo hướng dẫn.',
          '• Bạn phải tạo mật khẩu đáp ứng yêu cầu bảo mật (tối thiểu 12 ký tự) và tự chịu trách nhiệm bảo mật thông tin đăng nhập của mình.',
          '• Bạn không được sử dụng tài khoản của người khác hoặc cung cấp thông tin sai lệch khi đăng ký.',
        ],
      },
      {
        heading: '3. Nội dung do người dùng tạo và quyền sở hữu trí tuệ',
        paragraphs: [
          '• Bạn giữ toàn bộ quyền sở hữu đối với dữ liệu và hình ảnh bạn tải lên GoPlant (bao gồm tên vườn, ghi chú, nhật ký chăm sóc và ảnh cây trồng).',
          '• Khi tải nội dung lên hệ thống, bạn cấp cho GoPlant quyền lưu trữ, xử lý và hiển thị lại nội dung đó nhằm phục vụ chính tài khoản của bạn.',
          '• Giao diện, mã nguồn, biểu tượng, danh mục cây mặc định và tài liệu của GoPlant thuộc quyền sở hữu của [Tên đơn vị / Nhóm phát triển GoPlant]. Bạn không được sao chép, phân phối lại hoặc khai thác thương mại trái phép.',
        ],
      },
      {
        heading: '4. Quy tắc sử dụng hợp lệ',
        paragraphs: [
          'Bạn cam kết không thực hiện các hành vi sau:',
          '• Tải lên hình ảnh hoặc nội dung vi phạm pháp luật, phản cảm, xâm phạm quyền riêng tư hoặc bản quyền của bên thứ ba;',
          '• Can thiệp, tấn công, dò quét lỗ hổng hoặc gây quá tải trái phép đối với máy chủ và API của GoPlant;',
          '• Sử dụng ứng dụng vào mục đích gian lận hoặc gây ảnh hưởng đến người dùng khác.',
        ],
      },
      {
        heading: '5. Miễn trừ trách nhiệm chuyên môn và gián đoạn dịch vụ',
        paragraphs: [
          '• Thông tin về đặc điểm loài, lưu ý an toàn cây trồng, lịch chăm sóc và cảnh báo nhiệt độ trong GoPlant chỉ mang tính chất tham khảo, không thay thế tư vấn chuyên môn về nông học, làm vườn chuyên sâu, y tế hoặc thú y.',
          '• Dữ liệu thời tiết được tổng hợp từ nhà cung cấp bên thứ ba; GoPlant không đảm bảo độ chính xác tuyệt đối theo từng vi khí hậu cụ thể.',
          '• Chúng tôi nỗ lực duy trì hệ thống ổn định nhưng có thể tạm ngưng để bảo trì, nâng cấp hoặc khắc phục sự cố kỹ thuật mà không cần báo trước trong trường hợp khẩn cấp.',
        ],
      },
      {
        heading: '6. Chấm dứt sử dụng và thay đổi điều khoản',
        paragraphs: [
          '• Bạn có thể ngừng sử dụng GoPlant bất kỳ lúc nào. Nếu muốn yêu cầu xóa tài khoản và dữ liệu liên quan, vui lòng liên hệ bộ phận hỗ trợ qua email bên dưới.',
          '• GoPlant có quyền chấm dứt hoặc tạm khóa tài khoản nếu phát hiện hành vi vi phạm nghiêm trọng các điều khoản này.',
          '• Khi có thay đổi về Điều khoản dịch vụ, chúng tôi sẽ cập nhật ngày hiệu lực mới ngay trong ứng dụng. Việc bạn tiếp tục sử dụng ứng dụng sau thời điểm cập nhật đồng nghĩa với việc bạn chấp nhận các điều khoản mới.',
        ],
      },
      {
        heading: '7. Liên hệ',
        paragraphs: [
          'Mọi thắc mắc hoặc yêu cầu hỗ trợ liên quan đến Điều khoản dịch vụ, vui lòng liên hệ:',
          '• Đơn vị vận hành: [Đội ngũ phát triển GoPlant / Tổ chức DDVL]',
          '• Email hỗ trợ: [goplant@gmail.com]',
        ],
      },
    ],
  },
  policy: {
    key: 'policy',
    title: 'CHÍNH SÁCH BẢO MẬT GOPLANT',
    updatedAt: 'Cập nhật lần cuối: [16/11/2026]',
    intro:
      'GoPlant tôn trọng và cam kết bảo vệ quyền riêng tư của bạn. Chính sách này giải thích rõ những dữ liệu GoPlant thu thập, cách chúng tôi sử dụng, lưu trữ và các quyền của bạn đối với dữ liệu cá nhân.',
    sections: [
      {
        heading: '1. Dữ liệu chúng tôi thu thập',
        paragraphs: [
          'Tùy theo tính năng bạn sử dụng, GoPlant thu thập các nhóm dữ liệu sau:',
          'a) Thông tin tài khoản:\n• Họ và tên hiển thị, địa chỉ email, múi giờ và mật khẩu (mật khẩu được mã hóa/băm bảo mật trên máy chủ, chúng tôi không lưu hoặc xem được mật khẩu gốc của bạn).',
          'b) Dữ liệu khu vườn và chăm sóc cây:\n• Thông tin khu vườn (tên vườn, tỉnh/thành hoặc vị trí vườn bạn thiết lập), danh sách cây sở hữu, lịch chăm sóc, trạng thái hoàn thành công việc và nhật ký chăm sóc.',
          'c) Hình ảnh bạn tải lên:\n• Ảnh cây sở hữu và ảnh nhật ký chăm sóc (định dạng JPEG hoặc PNG, dung lượng tối đa 5 MB/ảnh). Ảnh được lưu trữ trên máy chủ riêng của GoPlant ở chế độ riêng tư và chỉ tài khoản chủ sở hữu mới có quyền truy cập.',
          'd) Quyền truy cập thiết bị (chỉ kích hoạt khi bạn cho phép):\n• Quyền truy cập Thư viện ảnh: dùng để chọn và tải lên ảnh cây trồng hoặc ảnh nhật ký.\n• Quyền truy cập Vị trí (khi đang dùng ứng dụng): dùng để xác định khu vực nhằm cập nhật thông tin thời tiết và cảnh báo nhiệt độ cho khu vườn của bạn.',
          'e) Dữ liệu lưu cục bộ trên thiết bị:\n• Mã phiên đăng nhập (access token, refresh token) được lưu an toàn bằng Expo SecureStore trên thiết bị di động (hoặc localStorage trên trình duyệt web) để duy trì trạng thái đăng nhập.\n• Các tùy chọn cài đặt giao diện/ứng dụng được lưu cục bộ trên thiết bị.',
        ],
      },
      {
        heading: '2. Mục đích sử dụng dữ liệu',
        paragraphs: [
          'Chúng tôi chỉ sử dụng dữ liệu của bạn để:',
          '• Tạo tài khoản, xác minh email, đăng nhập và hỗ trợ đặt lại mật khẩu khi bạn yêu cầu;',
          '• Lưu trữ, đồng bộ và hiển thị khu vườn, cây trồng, lịch trình và nhật ký chăm sóc của riêng bạn;',
          '• Lấy dữ liệu thời tiết và đưa ra cảnh báo nhiệt độ phù hợp cho từng khu vườn;',
          '• Bảo đảm an toàn hệ thống, phát hiện truy cập bất thường và khắc phục lỗi kỹ thuật.',
        ],
      },
      {
        heading: '3. Chia sẻ dữ liệu với bên thứ ba',
        paragraphs: [
          '• GoPlant KHÔNG bán, cho thuê hoặc trao đổi dữ liệu cá nhân của bạn cho bên thứ ba, và KHÔNG sử dụng dữ liệu của bạn cho mục đích quảng cáo.',
          '• Để cung cấp tính năng thời tiết cho khu vườn, thông tin vị trí/khu vực của vườn có thể được gửi tới nhà cung cấp dịch vụ thời tiết bên thứ ba (OpenWeather) để lấy dữ liệu dự báo tương ứng.',
        ],
      },
      {
        heading: '4. Lưu trữ và bảo mật dữ liệu',
        paragraphs: [
          '• Dữ liệu tài khoản, vườn, lịch, nhật ký và ảnh riêng tư được lưu trữ trên hệ thống máy chủ cơ sở dữ liệu của GoPlant và được bảo vệ bằng cơ chế xác thực phiên làm việc (Bearer Token).',
          '• Dù chúng tôi áp dụng các biện pháp kỹ thuật phù hợp để bảo vệ dữ liệu, không có hệ thống truyền tải qua Internet nào an toàn tuyệt đối 100%. Bạn cần giữ bí mật mật khẩu và đăng xuất khỏi thiết bị công cộng nếu sử dụng phiên bản web.',
        ],
      },
      {
        heading: '5. Quyền của bạn đối với dữ liệu',
        paragraphs: [
          'Bạn có quyền:',
          '• Xem và chỉnh sửa trực tiếp dữ liệu khu vườn, cây sở hữu, lịch chăm sóc và nhật ký của mình ngay trong ứng dụng;',
          '• Thay đổi mật khẩu tài khoản khi cần thiết;',
          '• Thu hồi quyền truy cập Vị trí hoặc Thư viện ảnh bất kỳ lúc nào trong phần Cài đặt của thiết bị (lưu ý một số tính năng liên quan có thể không hoạt động khi thiếu quyền);',
          '• Gửi yêu cầu hỗ trợ trích xuất hoặc xóa vĩnh viễn tài khoản và dữ liệu cá nhân bằng cách liên hệ bộ phận hỗ trợ (hiện tại tính năng tự xóa tài khoản chưa tích hợp trực tiếp trong ứng dụng).',
        ],
      },
      {
        heading: '6. Thay đổi chính sách và liên hệ',
        paragraphs: [
          'Chúng tôi có thể cập nhật Chính sách bảo mật này khi ứng dụng bổ sung tính năng mới hoặc theo yêu cầu pháp luật. Mọi thay đổi sẽ được cập nhật tại mục Quyền riêng tư & dữ liệu và màn hình Đăng ký.',
          'Liên hệ về quyền riêng tư & yêu cầu xóa dữ liệu:',
          '• Đơn vị vận hành: [Đội ngũ phát triển GoPlant / Tổ chức DDVL]',
          '• Email hỗ trợ: [goplant@gmail.com]',
        ],
      },
    ],
  },
};
