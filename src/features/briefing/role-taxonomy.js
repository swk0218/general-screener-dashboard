import legacy from './role-taxonomy.json' with {type:'json'};
import direct from './role-taxonomy-v2.json' with {type:'json'};

export const DIRECT_ROLE_PROFILE='direct-reviewed-document-candidates-v1';
export const DIRECT_TAXONOMY_HASH='d17846017269735550921380bc280b4822f73fc521b1aa1b463525a980b77838';

// Historical outputs retain their original definitions; model prose cannot
// replace the role contract. Only a reader-validated contract selects it.
export function roleTaxonomyFor(data){
  return data?._validated_role_profile===DIRECT_ROLE_PROFILE?direct:legacy;
}
