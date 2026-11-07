/** 设备登记表 `p2p.devices` 的 Supabase 实现；RLS 只放行本人的设备。 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeviceApi, RegisteredDevice } from './device-registration';

/** 以当前登录用户的身份读写设备登记。 */
export const supabaseDeviceApi = (client: SupabaseClient): DeviceApi => {
  const devices = () => client.schema('p2p').from('devices');
  return {
    findDevice: async id => {
      const { data, error } = await devices().select('id,name').eq('id', id).maybeSingle<RegisteredDevice>();
      if (error) throw error;
      return data;
    },
    registerDevice: async (name, publicKeyBase64) => {
      const { data, error } = await devices()
        .insert({ name, public_key: publicKeyBase64 })
        .select('id,name')
        .single<RegisteredDevice>();
      if (error) throw error;
      return data;
    },
    setPublicKey: async (id, publicKeyBase64) => {
      const { error } = await devices().update({ public_key: publicKeyBase64 }).eq('id', id);
      if (error) throw error;
    }
  };
};
