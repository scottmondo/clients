import { Directive, EventEmitter, Input, OnDestroy, OnInit, Output } from "@angular/core";
import { Observable, Subject, takeUntil, concatMap } from "rxjs";

import { AuditService } from "@bitwarden/common/abstractions/audit.service";
import { CipherService } from "@bitwarden/common/abstractions/cipher.service";
import { CollectionService } from "@bitwarden/common/abstractions/collection.service";
import { EventService } from "@bitwarden/common/abstractions/event.service";
import { FolderService } from "@bitwarden/common/abstractions/folder/folder.service.abstraction";
import { I18nService } from "@bitwarden/common/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/abstractions/messaging.service";
import { OrganizationService } from "@bitwarden/common/abstractions/organization/organization.service.abstraction";
import { PasswordRepromptService } from "@bitwarden/common/abstractions/passwordReprompt.service";
import { PlatformUtilsService } from "@bitwarden/common/abstractions/platformUtils.service";
import { PolicyService } from "@bitwarden/common/abstractions/policy/policy.service.abstraction";
import { StateService } from "@bitwarden/common/abstractions/state.service";
import { CipherRepromptType } from "@bitwarden/common/enums/cipherRepromptType";
import { CipherType } from "@bitwarden/common/enums/cipherType";
import { EventType } from "@bitwarden/common/enums/eventType";
import { OrganizationUserStatusType } from "@bitwarden/common/enums/organizationUserStatusType";
import { PolicyType } from "@bitwarden/common/enums/policyType";
import { SecureNoteType } from "@bitwarden/common/enums/secureNoteType";
import { UriMatchType } from "@bitwarden/common/enums/uriMatchType";
import { Utils } from "@bitwarden/common/misc/utils";
import { Cipher } from "@bitwarden/common/models/domain/cipher";
import { CardView } from "@bitwarden/common/models/view/card.view";
import { CipherView } from "@bitwarden/common/models/view/cipher.view";
import { CollectionView } from "@bitwarden/common/models/view/collection.view";
import { FolderView } from "@bitwarden/common/models/view/folder.view";
import { IdentityView } from "@bitwarden/common/models/view/identity.view";
import { LoginUriView } from "@bitwarden/common/models/view/login-uri.view";
import { LoginView } from "@bitwarden/common/models/view/login.view";
import { SecureNoteView } from "@bitwarden/common/models/view/secure-note.view";

@Directive()
export class AddEditComponent implements OnInit, OnDestroy {
  @Input() cloneMode = false;
  @Input() folderId: string = null;
  @Input() cipherId: string;
  @Input() type: CipherType;
  @Input() collectionIds: string[];
  @Input() organizationId: string = null;
  @Output() onSavedCipher = new EventEmitter<CipherView>();
  @Output() onDeletedCipher = new EventEmitter<CipherView>();
  @Output() onRestoredCipher = new EventEmitter<CipherView>();
  @Output() onCancelled = new EventEmitter<CipherView>();
  @Output() onEditAttachments = new EventEmitter<CipherView>();
  @Output() onShareCipher = new EventEmitter<CipherView>();
  @Output() onEditCollections = new EventEmitter<CipherView>();
  @Output() onGeneratePassword = new EventEmitter();
  @Output() onGenerateUsername = new EventEmitter();

  editMode = false;
  cipher: CipherView;
  folders$: Observable<FolderView[]>;
  collections: CollectionView[] = [];
  title: string;
  formPromise: Promise<any>;
  deletePromise: Promise<any>;
  restorePromise: Promise<any>;
  checkPasswordPromise: Promise<number>;
  showPassword = false;
  showCardNumber = false;
  showCardCode = false;
  cipherType = CipherType;
  typeOptions: any[];
  cardBrandOptions: any[];
  cardExpMonthOptions: any[];
  identityTitleOptions: any[];
  uriMatchOptions: any[];
  ownershipOptions: any[] = [];
  autofillOnPageLoadOptions: any[];
  currentDate = new Date();
  allowPersonal = true;
  reprompt = false;
  canUseReprompt = true;

  protected destroy$ = new Subject<void>();
  protected writeableCollections: CollectionView[];
  private personalOwnershipPolicyAppliesToActiveUser: boolean;
  private previousCipherId: string;

  constructor(
    protected cipherService: CipherService,
    protected folderService: FolderService,
    protected i18nService: I18nService,
    protected platformUtilsService: PlatformUtilsService,
    protected auditService: AuditService,
    protected stateService: StateService,
    protected collectionService: CollectionService,
    protected messagingService: MessagingService,
    protected eventService: EventService,
    protected policyService: PolicyService,
    private logService: LogService,
    protected passwordRepromptService: PasswordRepromptService,
    private organizationService: OrganizationService
  ) {
    this.typeOptions = [
      { name: i18nService.t("typeLogin"), value: CipherType.Login },
      { name: i18nService.t("typeCard"), value: CipherType.Card },
      { name: i18nService.t("typeIdentity"), value: CipherType.Identity },
      { name: i18nService.t("typeSecureNote"), value: CipherType.SecureNote },
    ];
    this.cardBrandOptions = [
      { name: "-- " + i18nService.t("select") + " --", value: null },
      { name: "Visa", value: "Visa" },
      { name: "Mastercard", value: "Mastercard" },
      { name: "American Express", value: "Amex" },
      { name: "Discover", value: "Discover" },
      { name: "Diners Club", value: "Diners Club" },
      { name: "JCB", value: "JCB" },
      { name: "Maestro", value: "Maestro" },
      { name: "UnionPay", value: "UnionPay" },
      { name: "RuPay", value: "RuPay" },
      { name: i18nService.t("cardBrandMir"), value: "Mir" },
      { name: i18nService.t("other"), value: "Other" },
    ];
    this.cardExpMonthOptions = [
      { name: "-- " + i18nService.t("select") + " --", value: null },
      { name: "01 - " + i18nService.t("january"), value: "1" },
      { name: "02 - " + i18nService.t("february"), value: "2" },
      { name: "03 - " + i18nService.t("march"), value: "3" },
      { name: "04 - " + i18nService.t("april"), value: "4" },
      { name: "05 - " + i18nService.t("may"), value: "5" },
      { name: "06 - " + i18nService.t("june"), value: "6" },
      { name: "07 - " + i18nService.t("july"), value: "7" },
      { name: "08 - " + i18nService.t("august"), value: "8" },
      { name: "09 - " + i18nService.t("september"), value: "9" },
      { name: "10 - " + i18nService.t("october"), value: "10" },
      { name: "11 - " + i18nService.t("november"), value: "11" },
      { name: "12 - " + i18nService.t("december"), value: "12" },
    ];
    this.identityTitleOptions = [
      { name: "-- " + i18nService.t("select") + " --", value: null },
      { name: i18nService.t("mr"), value: i18nService.t("mr") },
      { name: i18nService.t("mrs"), value: i18nService.t("mrs") },
      { name: i18nService.t("ms"), value: i18nService.t("ms") },
      { name: i18nService.t("dr"), value: i18nService.t("dr") },
    ];
    this.uriMatchOptions = [
      { name: i18nService.t("defaultMatchDetection"), value: null },
      { name: i18nService.t("baseDomain"), value: UriMatchType.Domain },
      { name: i18nService.t("host"), value: UriMatchType.Host },
      { name: i18nService.t("startsWith"), value: UriMatchType.StartsWith },
      { name: i18nService.t("regEx"), value: UriMatchType.RegularExpression },
      { name: i18nService.t("exact"), value: UriMatchType.Exact },
      { name: i18nService.t("never"), value: UriMatchType.Never },
    ];
    this.autofillOnPageLoadOptions = [
      { name: i18nService.t("autoFillOnPageLoadUseDefault"), value: null },
      { name: i18nService.t("autoFillOnPageLoadYes"), value: true },
      { name: i18nService.t("autoFillOnPageLoadNo"), value: false },
    ];
  }

  async ngOnInit() {
    this.policyService
      .policyAppliesToActiveUser$(PolicyType.PersonalOwnership)
      .pipe(
        concatMap(async (policyAppliesToActiveUser) => {
          this.personalOwnershipPolicyAppliesToActiveUser = policyAppliesToActiveUser;
          await this.init();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async init() {
    if (this.ownershipOptions.length) {
      this.ownershipOptions = [];
    }
    if (this.personalOwnershipPolicyAppliesToActiveUser) {
      this.allowPersonal = false;
    } else {
      const myEmail = await this.stateService.getEmail();
      this.ownershipOptions.push({ name: myEmail, value: null });
    }

    const orgs = await this.organizationService.getAll();
    orgs.sort(Utils.getSortFunction(this.i18nService, "name")).forEach((o) => {
      if (o.enabled && o.status === OrganizationUserStatusType.Confirmed) {
        this.ownershipOptions.push({ name: o.name, value: o.id });
      }
    });
    if (!this.allowPersonal) {
      this.organizationId = this.ownershipOptions[0].value;
    }

    this.writeableCollections = await this.loadCollections();

    this.canUseReprompt = await this.passwordRepromptService.enabled();
  }

  async load() {
    this.editMode = this.cipherId != null;
    if (this.editMode) {
      this.editMode = true;
      if (this.cloneMode) {
        this.cloneMode = true;
        this.title = this.i18nService.t("addItem");
      } else {
        this.title = this.i18nService.t("editItem");
      }
    } else {
      this.title = this.i18nService.t("addItem");
    }

    const addEditCipherInfo: any = await this.stateService.getAddEditCipherInfo();
    if (addEditCipherInfo != null) {
      this.cipher = addEditCipherInfo.cipher;
      this.collectionIds = addEditCipherInfo.collectionIds;
    }
    await this.stateService.setAddEditCipherInfo(null);

    if (this.cipher == null) {
      if (this.editMode) {
        const cipher = await this.loadCipher();
        this.cipher = await cipher.decrypt();

        // Adjust Cipher Name if Cloning
        if (this.cloneMode) {
          this.cipher.name += " - " + this.i18nService.t("clone");
          // If not allowing personal ownership, update cipher's org Id to prompt downstream changes
          if (this.cipher.organizationId == null && !this.allowPersonal) {
            this.cipher.organizationId = this.organizationId;
          }
        }
      } else {
        this.cipher = new CipherView();
        this.cipher.organizationId = this.organizationId == null ? null : this.organizationId;
        this.cipher.folderId = this.folderId;
        this.cipher.type = this.type == null ? CipherType.Login : this.type;
        this.cipher.login = new LoginView();
        this.cipher.login.uris = [new LoginUriView()];
        this.cipher.card = new CardView();
        this.cipher.identity = new IdentityView();
        this.cipher.secureNote = new SecureNoteView();
        this.cipher.secureNote.type = SecureNoteType.Generic;
        this.cipher.reprompt = CipherRepromptType.None;
      }
    }

    if (this.cipher != null && (!this.editMode || addEditCipherInfo != null || this.cloneMode)) {
      await this.organizationChanged();
      if (
        this.collectionIds != null &&
        this.collectionIds.length > 0 &&
        this.collections.length > 0
      ) {
        this.collections.forEach((c) => {
          if (this.collectionIds.indexOf(c.id) > -1) {
            (c as any).checked = true;
          }
        });
      }
    }

    this.folders$ = this.folderService.folderViews$;

    if (this.editMode && this.previousCipherId !== this.cipherId) {
      this.eventService.collect(EventType.Cipher_ClientViewed, this.cipherId);
    }
    this.previousCipherId = this.cipherId;
    this.reprompt = this.cipher.reprompt !== CipherRepromptType.None;
  }

  async submit(): Promise<boolean> {
    if (this.cipher.isDeleted) {
      return this.restore();
    }

    if (this.cipher.name == null || this.cipher.name === "") {
      this.platformUtilsService.showToast(
        "error",
        this.i18nService.t("errorOccurred"),
        this.i18nService.t("nameRequired")
      );
      return false;
    }

    if (
      (!this.editMode || this.cloneMode) &&
      !this.allowPersonal &&
      this.cipher.organizationId == null
    ) {
      this.platformUtilsService.showToast(
        "error",
        this.i18nService.t("errorOccurred"),
        this.i18nService.t("personalOwnershipSubmitError")
      );
      return false;
    }

    if (
      (!this.editMode || this.cloneMode) &&
      this.cipher.type === CipherType.Login &&
      this.cipher.login.uris != null &&
      this.cipher.login.uris.length === 1 &&
      (this.cipher.login.uris[0].uri == null || this.cipher.login.uris[0].uri === "")
    ) {
      this.cipher.login.uris = null;
    }

    // Allows saving of selected collections during "Add" and "Clone" flows
    if ((!this.editMode || this.cloneMode) && this.cipher.organizationId != null) {
      this.cipher.collectionIds =
        this.collections == null
          ? []
          : this.collections.filter((c) => (c as any).checked).map((c) => c.id);
    }

    // Clear current Cipher Id to trigger "Add" cipher flow
    if (this.cloneMode) {
      this.cipher.id = null;
    }

    const cipher = await this.encryptCipher();
    try {
      this.formPromise = this.saveCipher(cipher);
      await this.formPromise;
      this.cipher.id = cipher.id;
      this.platformUtilsService.showToast(
        "success",
        null,
        this.i18nService.t(this.editMode && !this.cloneMode ? "editedItem" : "addedItem")
      );
      this.onSavedCipher.emit(this.cipher);
      this.messagingService.send(this.editMode && !this.cloneMode ? "editedCipher" : "addedCipher");
      return true;
    } catch (e) {
      this.logService.error(e);
    }

    return false;
  }

  addUri() {
    if (this.cipher.type !== CipherType.Login) {
      return;
    }

    if (this.cipher.login.uris == null) {
      this.cipher.login.uris = [];
    }

    this.cipher.login.uris.push(new LoginUriView());
  }

  removeUri(uri: LoginUriView) {
    if (this.cipher.type !== CipherType.Login || this.cipher.login.uris == null) {
      return;
    }

    const i = this.cipher.login.uris.indexOf(uri);
    if (i > -1) {
      this.cipher.login.uris.splice(i, 1);
    }
  }

  trackByFunction(index: number, item: any) {
    return index;
  }

  cancel() {
    this.onCancelled.emit(this.cipher);
  }

  attachments() {
    this.onEditAttachments.emit(this.cipher);
  }

  share() {
    this.onShareCipher.emit(this.cipher);
  }

  editCollections() {
    this.onEditCollections.emit(this.cipher);
  }

  async delete(): Promise<boolean> {
    const confirmed = await this.platformUtilsService.showDialog(
      this.i18nService.t(
        this.cipher.isDeleted ? "permanentlyDeleteItemConfirmation" : "deleteItemConfirmation"
      ),
      this.i18nService.t("deleteItem"),
      this.i18nService.t("yes"),
      this.i18nService.t("no"),
      "warning"
    );
    if (!confirmed) {
      return false;
    }

    try {
      this.deletePromise = this.deleteCipher();
      await this.deletePromise;
      this.platformUtilsService.showToast(
        "success",
        null,
        this.i18nService.t(this.cipher.isDeleted ? "permanentlyDeletedItem" : "deletedItem")
      );
      this.onDeletedCipher.emit(this.cipher);
      this.messagingService.send(
        this.cipher.isDeleted ? "permanentlyDeletedCipher" : "deletedCipher"
      );
    } catch (e) {
      this.logService.error(e);
    }

    return true;
  }

  async restore(): Promise<boolean> {
    if (!this.cipher.isDeleted) {
      return false;
    }

    const confirmed = await this.platformUtilsService.showDialog(
      this.i18nService.t("restoreItemConfirmation"),
      this.i18nService.t("restoreItem"),
      this.i18nService.t("yes"),
      this.i18nService.t("no"),
      "warning"
    );
    if (!confirmed) {
      return false;
    }

    try {
      this.restorePromise = this.restoreCipher();
      await this.restorePromise;
      this.platformUtilsService.showToast("success", null, this.i18nService.t("restoredItem"));
      this.onRestoredCipher.emit(this.cipher);
      this.messagingService.send("restoredCipher");
    } catch (e) {
      this.logService.error(e);
    }

    return true;
  }

  async generateUsername(): Promise<boolean> {
    if (this.cipher.login?.username?.length) {
      const confirmed = await this.platformUtilsService.showDialog(
        this.i18nService.t("overwriteUsernameConfirmation"),
        this.i18nService.t("overwriteUsername"),
        this.i18nService.t("yes"),
        this.i18nService.t("no")
      );
      if (!confirmed) {
        return false;
      }
    }

    this.onGenerateUsername.emit();
    return true;
  }

  async generatePassword(): Promise<boolean> {
    if (this.cipher.login?.password?.length) {
      const confirmed = await this.platformUtilsService.showDialog(
        this.i18nService.t("overwritePasswordConfirmation"),
        this.i18nService.t("overwritePassword"),
        this.i18nService.t("yes"),
        this.i18nService.t("no")
      );
      if (!confirmed) {
        return false;
      }
    }

    this.onGeneratePassword.emit();
    return true;
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
    document.getElementById("loginPassword").focus();
    if (this.editMode && this.showPassword) {
      this.eventService.collect(EventType.Cipher_ClientToggledPasswordVisible, this.cipherId);
    }
  }

  async toggleCardNumber() {
    this.showCardNumber = !this.showCardNumber;
    if (this.showCardNumber) {
      this.eventService.collect(EventType.Cipher_ClientToggledCardNumberVisible, this.cipherId);
    }
  }

  toggleCardCode() {
    this.showCardCode = !this.showCardCode;
    document.getElementById("cardCode").focus();
    if (this.editMode && this.showCardCode) {
      this.eventService.collect(EventType.Cipher_ClientToggledCardCodeVisible, this.cipherId);
    }
  }

  toggleUriOptions(uri: LoginUriView) {
    const u = uri as any;
    u.showOptions = u.showOptions == null && uri.match != null ? false : !u.showOptions;
  }

  loginUriMatchChanged(uri: LoginUriView) {
    const u = uri as any;
    u.showOptions = u.showOptions == null ? true : u.showOptions;
  }

  async organizationChanged() {
    if (this.writeableCollections != null) {
      this.writeableCollections.forEach((c) => ((c as any).checked = false));
    }
    if (this.cipher.organizationId != null) {
      this.collections = this.writeableCollections.filter(
        (c) => c.organizationId === this.cipher.organizationId
      );
      const org = await this.organizationService.get(this.cipher.organizationId);
      if (org != null) {
        this.cipher.organizationUseTotp = org.useTotp;
      }
    } else {
      this.collections = [];
    }
  }

  async checkPassword() {
    if (this.checkPasswordPromise != null) {
      return;
    }

    if (
      this.cipher.login == null ||
      this.cipher.login.password == null ||
      this.cipher.login.password === ""
    ) {
      return;
    }

    this.checkPasswordPromise = this.auditService.passwordLeaked(this.cipher.login.password);
    const matches = await this.checkPasswordPromise;
    this.checkPasswordPromise = null;

    if (matches > 0) {
      this.platformUtilsService.showToast(
        "warning",
        null,
        this.i18nService.t("passwordExposed", matches.toString())
      );
    } else {
      this.platformUtilsService.showToast("success", null, this.i18nService.t("passwordSafe"));
    }
  }

  repromptChanged() {
    this.reprompt = !this.reprompt;
    if (this.reprompt) {
      this.cipher.reprompt = CipherRepromptType.Password;
    } else {
      this.cipher.reprompt = CipherRepromptType.None;
    }
  }

  protected async loadCollections() {
    const allCollections = await this.collectionService.getAllDecrypted();
    return allCollections.filter((c) => !c.readOnly);
  }

  protected loadCipher() {
    return this.cipherService.get(this.cipherId);
  }

  protected encryptCipher() {
    return this.cipherService.encrypt(this.cipher);
  }

  protected saveCipher(cipher: Cipher) {
    return this.cipherService.saveWithServer(cipher);
  }

  protected deleteCipher() {
    return this.cipher.isDeleted
      ? this.cipherService.deleteWithServer(this.cipher.id)
      : this.cipherService.softDeleteWithServer(this.cipher.id);
  }

  protected restoreCipher() {
    return this.cipherService.restoreWithServer(this.cipher.id);
  }
}
